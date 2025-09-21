import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, List, Optional, Dict
from urllib import request, parse

router = APIRouter()


class EmotionSnapshot(BaseModel):
    dominant_emotion: Optional[str] = None
    emotion_scores: Optional[Dict[str, float]] = None


class GestureSnapshot(BaseModel):
    label: Optional[str] = None
    label_ja: Optional[str] = None
    score: Optional[float] = None


class MultimodalEntry(BaseModel):
    timestamp: str
    text: str
    mode: str
    start: Optional[float] = None
    end: Optional[float] = None
    emotion: Optional[EmotionSnapshot] = None
    gesture: Optional[GestureSnapshot] = None


class AnalyzeRequest(BaseModel):
    entries: List[MultimodalEntry]


def _gesture_to_emotion(label: Optional[str]) -> Optional[str]:
    if not label:
        return None
    mapping = {
        'Thumb_Up': 'happy',
        'Victory': 'happy',
        'ILoveYou': 'happy',
        'Closed_Fist': 'angry',
        'Thumb_Down': 'angry',
        'Open_Palm': 'neutral',
        'Pointing_Up': 'neutral',
    }
    return mapping.get(label, None)


def _text_to_emotion(text: str) -> str:
    t = text.lower()
    # simple JA heuristic (ASCII lower unaffected) + JP keywords
    if any(k in text for k in ['嬉', '楽', '最高', 'すごい', 'よかった', '助かる']):
        return 'happy'
    if any(k in text for k in ['怒', 'ムカ', '最悪', '腹立', '許せ']):
        return 'angry'
    if any(k in text for k in ['怖', '心配', '不安']):
        return 'fear'
    if any(k in text for k in ['嫌', 'やだ', 'きも', 'うんざり']):
        return 'disgust'
    if any(k in text for k in ['悲', '泣', 'つら', 'しんど']):
        return 'sad'
    if 'びっくり' in text or '驚' in text:
        return 'surprise'
    # english fallbacks
    if any(k in t for k in ['great', 'awesome', 'nice', 'love']):
        return 'happy'
    if any(k in t for k in ['angry', 'mad', 'furious']):
        return 'angry'
    if any(k in t for k in ['scared', 'afraid', 'fear']):
        return 'fear'
    if any(k in t for k in ['sad', 'unhappy']):
        return 'sad'
    if any(k in t for k in ['surprised', 'wow']):
        return 'surprise'
    return 'neutral'


def _local_aggregate(entries: List[MultimodalEntry]) -> Dict[str, Any]:
    # weights: emotion 0.6, gesture 0.3, text 0.1
    weights = {'emotion': 0.6, 'gesture': 0.3, 'text': 0.1}
    score: Dict[str, float] = {}
    for e in entries:
        if e.emotion and e.emotion.dominant_emotion:
            emo = e.emotion.dominant_emotion
            score[emo] = score.get(emo, 0.0) + weights['emotion']
        if e.gesture and e.gesture.label:
            ge = _gesture_to_emotion(e.gesture.label)
            if ge:
                score[ge] = score.get(ge, 0.0) + weights['gesture'] * (e.gesture.score or 1.0)
        if e.text:
            te = _text_to_emotion(e.text)
            score[te] = score.get(te, 0.0) + weights['text']

    if not score:
        dominant = 'neutral'
        confidence = 0.2
    else:
        dominant = max(score.items(), key=lambda kv: kv[1])[0]
        total = sum(score.values()) or 1.0
        confidence = min(1.0, score[dominant] / total)

    # craft brief intent and inner voice heuristically
    intent_map = {
        'happy': '前向きな反応を引き出したい/共有したい',
        'angry': '不満や問題点を認めさせたい/改善を求めたい',
        'fear': 'リスクや不安の解消を求めたい',
        'sad': '共感や支援を得たい',
        'surprise': '情報を確認したい/理解を深めたい',
        'disgust': '対象から距離を置きたい/代替案を求めたい',
        'neutral': '情報交換や状況確認をしたい',
    }
    inner_map = {
        'happy': '本当は嬉しくて、もっと良い流れを続けたい。',
        'angry': '本当は納得していなくて、変えてほしい。',
        'fear': '本当は心配で、失敗を避けたい。',
        'sad': '本当は気力が落ちていて、支えが欲しい。',
        'surprise': '本当は状況が掴めず、確証が欲しい。',
        'disgust': '本当は強い拒否感があり、別の選択肢が欲しい。',
        'neutral': '本当は様子見で、追加情報を待っている。',
    }

    summary = f"総合的には『{dominant}』寄り。感情>ジェスチャー>テキストの優先で集約。"
    intent = intent_map.get(dominant, '')
    inner = inner_map.get(dominant, '')
    return {
        'summary': summary,
        'emotion': dominant,
        'intent': intent,
        'inner_voice': inner,
        'confidence': round(confidence, 3),
        'raw': {'score_breakdown': score},
    }


def _extract_texts_from_payload(payload: Dict[str, Any]) -> str:
    try:
        texts: List[str] = []
        for cand in payload.get('candidates', []) or []:
            content = cand.get('content') or {}
            for part in content.get('parts', []) or []:
                t = part.get('text')
                if isinstance(t, str) and t.strip():
                    texts.append(t)
        return "\n".join(texts).strip()
    except Exception:
        return ""


def _parse_json_from_text(txt: str) -> Optional[Dict[str, Any]]:
    if not txt:
        return None
    try:
        # remove code fences
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", txt, re.IGNORECASE)
        if m:
            candidate = m.group(1)
            return json.loads(candidate)
        # try direct
        return json.loads(txt)
    except Exception:
        try:
            # find first '{' and last '}' and try
            start = txt.find('{')
            end = txt.rfind('}')
            if start != -1 and end != -1 and end > start:
                return json.loads(txt[start:end+1])
        except Exception:
            return None
    return None


def _call_gemini(entries: List[MultimodalEntry]) -> Dict[str, Any]:
    api_key = os.getenv('GOOGLE_API_KEY')
    if not api_key:
        raise RuntimeError('GOOGLE_API_KEY is not set')

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={parse.quote(api_key)}"
    # Build prompt
    instruction = (
        "あなたは会話理解のアナリストです。複数の観測(感情>ジェスチャー>テキストの優先度)から、話者の感情・意図を推定し、短く要約してください。"
        "出力はJSONで、keys: summary, emotion, intent, inner_voice, confidence。confidenceは0-1。"
    )
    content = [
        {"role": "user", "parts": [
            {"text": instruction + "\n観測データ:"},
            {"text": json.dumps([e.dict() for e in entries], ensure_ascii=False)}
        ]}
    ]
    data = {"contents": content}
    body = json.dumps(data).encode('utf-8')
    req = request.Request(url, data=body, headers={'Content-Type': 'application/json'})
    with request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode('utf-8'))
    # collect all texts and parse JSON
    txt = _extract_texts_from_payload(payload)
    parsed = _parse_json_from_text(txt)
    if parsed and isinstance(parsed, dict):
        return parsed
    # fallback structured minimal response
    return {
        "summary": (txt or "Gemini応答なし").strip()[:200],
        "emotion": "neutral",
        "intent": "状況確認",
        "inner_voice": "特に強い内心は読み取りづらい。",
        "confidence": 0.3,
        "raw": payload,
    }


@router.post('/gemini/analyze')
def analyze(req: AnalyzeRequest):
    entries = req.entries
    if not entries or len(entries) == 0:
        raise HTTPException(status_code=400, detail='entriesは1件以上必要です')
    # Always compute local aggregation for reliable defaults
    agg = _local_aggregate(entries)
    # Try Gemini; if it fails, return local
    try:
        result = _call_gemini(entries)
    except Exception:
        result = {}
    # Merge: Gemini takes precedence on available fields, otherwise fill from agg
    merged = {
        "summary": result.get("summary") or agg.get("summary"),
        "emotion": result.get("emotion") or agg.get("emotion"),
        "intent": result.get("intent") or agg.get("intent"),
        "inner_voice": result.get("inner_voice") or agg.get("inner_voice"),
        "confidence": result.get("confidence") or agg.get("confidence"),
        "raw": result.get("raw", None),
    }
    return merged
