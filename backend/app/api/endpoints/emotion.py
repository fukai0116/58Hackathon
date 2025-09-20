import cv2
import numpy as np
from fastapi import APIRouter, File, UploadFile, HTTPException
from deepface import DeepFace

router = APIRouter()

@router.post("/analyze")
async def analyze_emotion(file: UploadFile = File(...)):
    """
    画像ファイルを受け取り、顔の表情を分析して最も優位な感情を返す
    """
    # ファイルの内容を読み込む
    contents = await file.read()
    
    # バイナリデータをnumpy配列に変換
    nparr = np.frombuffer(contents, np.uint8)
    
    # numpy配列をOpenCV画像にデコード
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        # DeepFaceで感情分析を実行
        # 顔が検出されない場合のエラーを避けるため enforce_detection=False
        # 年齢、性別、人種も分析対象に追加し、検出器はデフォルト(RetinaFace)に戻す
        results = DeepFace.analyze(
            img, 
            actions=['emotion', 'age', 'gender', 'race'], 
            enforce_detection=False
        )
        
        # DeepFaceは複数の顔を検出する可能性があるため、結果はリストになる
        if not results or not isinstance(results, list):
             raise HTTPException(status_code=404, detail="Could not process the image with DeepFace.")

        first_result = results[0]
        
        # 顔が検出されたか確認
        if 'dominant_emotion' not in first_result:
            raise HTTPException(status_code=404, detail="No face detected in the image.")

        # 全ての分析結果を返す
        return {
            "dominant_emotion": first_result.get('dominant_emotion'),
            "age": first_result.get('age'),
            "dominant_gender": first_result.get('dominant_gender'),
            "dominant_race": first_result.get('dominant_race'),
        }

    except Exception as e:
        # DeepFace内で予期せぬエラーが発生した場合
        raise HTTPException(status_code=500, detail=f"An error occurred during analysis: {str(e)}")
