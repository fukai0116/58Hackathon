import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});

// Base64形式の画像データをBlobに変換するヘルパー関数
const dataURItoBlob = (dataURI: string) => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
};

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  words: {
    word: string;
    start: number;
    end: number;
    probability: number;
  }[];
}

interface TranscriptionResponse {
  segments: TranscriptionSegment[];
  language: string;
  language_probability: number;
}

export const transcribeAudio = async (audioBlob: Blob): Promise<TranscriptionResponse> => {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');

  try {
    const response = await apiClient.post('/transcribe', formData);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.detail || '文字起こしに失敗しました');
    } else {
      throw new Error('予期せぬエラーが発生しました');
    }
  }
};

export const analyzeEmotion = async (imageBase64: string) => {
  const blob = dataURItoBlob(imageBase64);
  const formData = new FormData();
  formData.append('file', blob, 'capture.jpg');

  try {
    const response = await apiClient.post('/analyze', formData);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      // バックエンドからのエラーメッセージをスローする
      throw new Error(error.response.data.detail || 'Analysis failed');
    } else {
      // その他のエラー
      throw new Error('An unexpected error occurred.');
    }
  }
};
