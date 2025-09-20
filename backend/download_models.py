import numpy as np
from PIL import Image
from deepface import DeepFace
import os

# ダミーの黒い画像を作成するパスを backend フォルダ内に設定
dummy_image_path = "dummy_image.jpg"

try:
    if not os.path.exists(dummy_image_path):
        print(f"Creating a dummy image: {dummy_image_path}")
        img_data = np.zeros((100, 100, 3), dtype=np.uint8)
        img = Image.fromarray(img_data, 'RGB')
        img.save(dummy_image_path)

    print("Starting model download by running a dummy analysis...")
    print("This may take a long time. Please wait until it is complete.")

    # analyzeを呼び出すことで、必要なモデル（顔検出＋感情分類）のダウンロードをトリガー
    # enforce_detection=False にして、ダミー画像で顔が検出できなくてもエラーにしない
    DeepFace.analyze(img_path=dummy_image_path, actions=['emotion'], enforce_detection=False)

    print("\nModel download process finished.")

except Exception as e:
    print(f"\nAn error occurred during model download: {e}")

finally:
    # ダミー画像を削除
    if os.path.exists(dummy_image_path):
        os.remove(dummy_image_path)
        print(f"Removed dummy image: {dummy_image_path}")
