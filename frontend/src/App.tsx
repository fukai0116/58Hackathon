import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { analyzeEmotion, transcribeAudio } from './services/api';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import './App.css';

// Web Speech APIの型定義
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

type SpeechRecognition = any;

const videoConstraints = {
  width: 720,
  height: 480,
  facingMode: 'user',
};

interface FaceOverlay {
  x: number;
  y: number;
  text: string;
}

interface Transcript {
  text: string;
  isFinal: boolean;
}

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

interface AnalysisResult {
  dominant_emotion: string | null;
  age: number | null;
  dominant_gender: string | null;
  dominant_race: string | null;
}

function App() {
  const webcamRef = useRef<Webcam>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const isLoadingRef = useRef<boolean>(false);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [faceOverlay, setFaceOverlay] = useState<FaceOverlay | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  
  // 音声認識関連の状態
  const [transcript, setTranscript] = useState<Transcript>({ text: '', isFinal: true });
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [transcriptionResults, setTranscriptionResults] = useState<TranscriptionSegment[]>([]);

  // 録音機能の制御
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        try {
          const result = await transcribeAudio(audioBlob);
          setTranscriptionResults(result.segments);
        } catch (err: any) {
          setError(err.message || '文字起こしに失敗しました');
        }
        // ストリームを停止
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // 1秒ごとにデータを取得
      setIsRecording(true);
      setError(null);
    } catch (error: any) {
      setError('マイクのアクセスに失敗しました: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  useEffect(() => {
    const createFaceLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: 'GPU'
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 1
      });
      setFaceLandmarker(landmarker);
    };
    createFaceLandmarker();
  }, []);

  const handleToggleAnalysis = () => {
    setIsAnalyzing(prev => !prev);
    if (isAnalyzing) {
      setAnalysisResult(null);
      setError(null);
      setFaceOverlay(null);
    }
  };

  useEffect(() => {
    if (!isAnalyzing) {
      return;
    }

    const intervalId = setInterval(async () => {
      if (isLoadingRef.current || !webcamRef.current) {
        return;
      }

      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        isLoadingRef.current = true;
        setError(null);
        try {
          const result = await analyzeEmotion(imageSrc);
          setAnalysisResult(result);
        } catch (err: any) {
          setError(err.message || 'Failed to analyze emotion.');
          setIsAnalyzing(false); // Stop analysis on error
          setFaceOverlay(null);
        } finally {
          isLoadingRef.current = false;
        }
      }
    }, 500); // 500ms = 0.5 seconds

    // MediaPipe Face Landmark検出処理
    const detectFace = () => {
      if (webcamRef.current?.video && faceLandmarker) {
        const video = webcamRef.current.video;
        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          const results = faceLandmarker.detectForVideo(video, Date.now());

          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];
            // 鼻の上部あたりを基準点にする (landmark 6)
            const noseTip = landmarks[6];
            if (noseTip && analysisResult?.dominant_emotion) {
              setFaceOverlay({
                x: noseTip.x * video.clientWidth,
                y: (noseTip.y * video.clientHeight) - 50, // 頭上に表示するため少し上にオフセット
                text: analysisResult.dominant_emotion
              });
            }
          } else {
            setFaceOverlay(null);
          }
        }
      }
      if (isAnalyzing) {
        requestAnimationFrame(detectFace);
      }
    };

    detectFace();

    return () => {
      clearInterval(intervalId);
    };
  }, [isAnalyzing, faceLandmarker, analysisResult]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Facial Emotion Analysis</h1>
        <div className="webcam-container">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            mirrored={true}
          />
          {faceOverlay && (
            <div 
              className="ar-overlay"
              style={{
                position: 'absolute',
                top: `${faceOverlay.y}px`,
                left: `${faceOverlay.x}px`,
                transform: 'translate(-50%, -100%)'
              }}
            >
              {faceOverlay.text}
            </div>
          )}
        </div>
        <div className="controls">
          <button 
            onClick={handleToggleAnalysis}
            disabled={!faceLandmarker}>
            {isAnalyzing ? '感情分析を停止' : '感情分析を開始'}
          </button>
          <button 
            onClick={toggleRecording}
            className={isRecording ? 'recording' : ''}>
            {isRecording ? '録音停止' : '録音開始'}
          </button>
        </div>

        <div className="results">
          <div className="analysis-results">
            {analysisResult?.dominant_emotion && (
              <p className="emotion-result">
                検出された感情: <span>{analysisResult.dominant_emotion}</span>
              </p>
            )}
            <div className="other-results">
              {analysisResult?.age && <p>年齢: <span>{analysisResult.age}</span></p>}
              {analysisResult?.dominant_gender && <p>性別: <span>{analysisResult.dominant_gender}</span></p>}
              {analysisResult?.dominant_race && <p>人種: <span>{analysisResult.dominant_race}</span></p>}
            </div>
          </div>

          <div className="transcript-container">
            <h3>文字起こし結果 {isRecording && <span className="recording-indicator">●録音中</span>}</h3>
            <div className="transcription-segments">
              {transcriptionResults.map((segment, index) => (
                <div key={index} className="transcription-segment">
                  <p className="text">{segment.text}</p>
                  <small className="timestamp">
                    {`${segment.start.toFixed(1)}秒 - ${segment.end.toFixed(1)}秒`}
                  </small>
                </div>
              ))}
              {transcriptionResults.length === 0 && (
                <p className="no-results">（ここに文字起こし結果が表示されます）</p>
              )}
            </div>
          </div>
          
          {error && <p className="error-message">エラー: {error}</p>}
        </div>
      </header>
    </div>
  );
}

export default App;