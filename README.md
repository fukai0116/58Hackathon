# 会話理解支援アプリ（表情・音声・発話マッチング）

このアプリは、会話の中で見落としがちな微細な変化を分析し、コミュニケーションを補助します。些細な表情や声色の変化、発話内容やジェスチャー、発話テキストと表情のマッチ度などから、相手がどういう感情・意図で発言したのかを視覚的に提示することを目指しています。

現在は第1段階として、Webカメラ映像からリアルタイムにフレームを取得し、DeepFaceで「感情／年齢／性別／人種」を推定して表示する機能を提供しています。

## 構成
- フロントエンド: React + TypeScript + Vite（`frontend/`）
  - `react-webcam`で0.5秒ごとに画像をキャプチャし、バックエンドへ送信
  - 推定結果（感情・年齢・性別・人種）を表示
- バックエンド: FastAPI（`backend/`）
  - `POST /api/analyze` に画像（multipart/form-data）を受け取り、DeepFaceで推定
  - CORSは `http://localhost:5173/5174/3000` を許可

## ディレクトリ
- `frontend/` フロントエンド（Vite + React + TS）
- `backend/` バックエンド（FastAPI + DeepFace）
- `開発.md` 開発ログ（トラブルシュート・検討事項を記録）

## セットアップ

### 1) バックエンド
1. Python仮想環境の作成と有効化（例）
   - Windows PowerShell
     - `cd backend`
     - `python -m venv venv`
     - `venv\\Scripts\\Activate.ps1`
2. 依存関係をインストール
   - `pip install -r requirements.txt`
   - 環境によっては `pip install tf-keras` が必要になることがあります（DeepFace依存のため）。
3. モデルの初回ダウンロード（時間がかかります）
   - `python download_models.py`
4. サーバー起動
   - `uvicorn main:app --reload`
   - デフォルトで `http://127.0.0.1:8000` で待ち受けます

### 2) フロントエンド
1. 依存関係をインストール
   - `cd frontend`
   - `npm install`
2. 開発サーバー起動
   - `npm run dev`
   - 例: `http://localhost:5173`

CORSエラーが発生する場合は、フロントの起動ポートが `5173/5174/3000` 以外になっている可能性があります。`backend/main.py` の `origins` に該当URLを追加してください。

## API 仕様（現状）
- `POST /api/analyze`
  - Content-Type: `multipart/form-data`
  - フィールド: `file`（画像）
  - レスポンス例:
    ```json
    {
      "dominant_emotion": "happy",
      "age": 28,
      "dominant_gender": "Man",
      "dominant_race": "white"
    }
    ```
  - 備考: 顔未検出でも `enforce_detection=False` で推論処理は継続しますが、結果が空の場合があります。

## トラブルシュート（抜粋）
- `net::ERR_CONNECTION_REFUSED` → バックエンド起動状態を確認
- CORSエラー → 起動ポートを `backend/main.py` の `origins` に追加
- `ValueError: You have tensorflow ... requires tf-keras` → `pip install tf-keras`
- 初回起動が非常に重い → DeepFaceモデルのダウンロード・初期化によるものです

## ロードマップ（構想）
- 音声のリアルタイム文字起こし（例: Faster-Whisper）
- 音声特徴（声色・抑揚）と表情・発話テキストのマッチ度算出
- ジェスチャー解析の追加（姿勢推定の導入検討）
- ダッシュボードでの時系列可視化・アラート

---
ご要望に応じて、環境構築のスクリプト化（例: Windows用PowerShell、Makefile）や、プロキシ設定（Viteの`server.proxy`でCORS回避）も対応可能です。
