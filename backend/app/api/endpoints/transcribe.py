from fastapi import APIRouter, UploadFile, File, HTTPException
from faster_whisper import WhisperModel
import tempfile
import os
import torch

router = APIRouter()

# グローバルなモデルインスタンス
model = WhisperModel(
    "small",
    device="cuda" if torch.cuda.is_available() else "cpu",
    compute_type="float16" if torch.cuda.is_available() else "int8",
    download_root="./models"
)

@router.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """音声ファイルを受け取り、文字起こしを行うエンドポイント"""
    if not audio.filename.lower().endswith(('.wav', '.mp3', '.webm', '.m4a')):
        raise HTTPException(
            status_code=400,
            detail="サポートされていない音声形式です。wav, mp3, webm, m4aのいずれかを使用してください。"
        )
    
    try:
        # 一時ファイルとして保存
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio.filename)[1]) as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_file.flush()
            
            # 文字起こしの実行
            segments, info = model.transcribe(
                temp_file.name,
                language="ja",  # 日本語指定
                beam_size=5,
                vad_filter=True,
                word_timestamps=True  # 単語ごとのタイムスタンプを取得
            )
            
            # 結果の整形
            results = []
            for segment in segments:
                results.append({
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "words": [
                        {
                            "word": word.word,
                            "start": word.start,
                            "end": word.end,
                            "probability": word.probability
                        }
                        for word in segment.words
                    ] if segment.words else []
                })
                
        # 一時ファイルの削除
        os.unlink(temp_file.name)
        
        return {
            "segments": results,
            "language": info.language,
            "language_probability": info.language_probability
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"文字起こし処理中にエラーが発生しました: {str(e)}"
        )