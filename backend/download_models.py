import numpy as np
from PIL import Image
from deepface import DeepFace
import os
from faster_whisper import WhisperModel
import torch

def download_emotion_model():
    print("Downloading DeepFace emotion model...")
    # ダミーの黒い画像を作成するパスを backend フォルダ内に設定
    dummy_image_path = "dummy_image.jpg"

    try:
        if not os.path.exists(dummy_image_path):
            print(f"Creating a dummy image: {dummy_image_path}")
            img_data = np.zeros((100, 100, 3), dtype=np.uint8)
            img = Image.fromarray(img_data, 'RGB')
            img.save(dummy_image_path)

        # analyzeを呼び出すことで、必要なモデル（顔検出＋感情分類）のダウンロードをトリガー
        # enforce_detection=False にして、ダミー画像で顔が検出できなくてもエラーにしない
        DeepFace.analyze(img_path=dummy_image_path, actions=['emotion'], enforce_detection=False)
        print("Emotion model downloaded successfully!")

    except Exception as e:
        print(f"\nAn error occurred during emotion model download: {e}")

    finally:
        if os.path.exists(dummy_image_path):
            os.remove(dummy_image_path)
            print(f"Removed dummy image: {dummy_image_path}")

def download_whisper_model():
    print("\nDownloading Whisper model...")
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if torch.cuda.is_available() else "int8"
        
        print(f"Using device: {device}, compute type: {compute_type}")
        # small モデルを使用（容量と精度のバランス）
        model = WhisperModel(
            "small",
            device=device,
            compute_type=compute_type,
            download_root="./models"
        )
        print("Whisper model downloaded successfully!")
        
    except Exception as e:
        print(f"\nAn error occurred during Whisper model download: {e}")

if __name__ == "__main__":
    download_emotion_model()
    download_whisper_model()
