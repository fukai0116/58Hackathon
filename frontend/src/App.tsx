import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { analyzeEmotion, transcribeAudio } from './services/api';
import { FaceLandmarker, FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { appendEmotionLog, appendTranscriptServer, appendTranscriptBrowser } from './utils/storage';
import './App.css';

// Web Speech APIの型定義
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

type SpeechRecognition = any;

type RecognitionMode = 'server' | 'browser';

const videoConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
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
  emotion_scores: { [key: string]: number } | null;
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
  const [gestureRecognizer, setGestureRecognizer] = useState<GestureRecognizer | null>(null);
  const [gestureOverlay, setGestureOverlay] = useState<FaceOverlay | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>('server');
  
  // 音声認識関連の状態
  const [transcript, setTranscript] = useState<Transcript>({ text: '', isFinal: true });
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [transcriptionResults, setTranscriptionResults] = useState<TranscriptionSegment[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

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
          result.segments.forEach((seg) => {
            try {
              appendTranscriptServer({
                text: seg.text,
                start: seg.start,
                end: seg.end,
                language: result.language,
                language_probability: result.language_probability,
              });
            } catch {}
          });
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

  // ブラウザ内（Web Speech API）の音声認識開始/停止
  const startBrowserRecognition = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('このブラウザはWeb Speech APIに対応していません');
      return;
    }
    const recognition: SpeechRecognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript; else interimText += res[0].transcript;
      }
      setTranscript({ text: (finalText ? transcript.text + finalText : transcript.text + interimText), isFinal: !!finalText });
      if (finalText && finalText.trim().length > 0) {
        try { appendTranscriptBrowser(finalText.trim()); } catch {}
      }
    };
    recognition.onerror = (e: any) => {
      setError('音声認識エラー: ' + (e?.error || 'unknown'));
    };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    setTranscript({ text: '', isFinal: true });
    recognition.start();
    setIsRecording(true);
  };

  const stopBrowserRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (!isRecording) {
      if (recognitionMode === 'server') startRecording(); else startBrowserRecognition();
    } else {
      if (recognitionMode === 'server') stopRecording(); else stopBrowserRecognition();
    }
  };

  const toggleRecognitionMode = () => {
    if (isRecording) {
      if (recognitionMode === 'server') stopRecording(); else stopBrowserRecognition();
    }
    setTranscript({ text: '', isFinal: true });
    setTranscriptionResults([]);
    setRecognitionMode(prev => (prev === 'server' ? 'browser' : 'server'));
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

  // Gesture Recognizer 初期化
  useEffect(() => {
    const createGestureRecognizer = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2
      });
      setGestureRecognizer(recognizer);
    };
    createGestureRecognizer();
  }, []);

  // ジェスチャー認識ループ（顔オーバーレイ位置の近くに表示）
  useEffect(() => {
    if (!isAnalyzing) { setGestureOverlay(null); return; }
    let rafId = 0;
    const loop = () => {
      try {
        const video = webcamRef.current?.video as HTMLVideoElement | undefined;
        if (video && gestureRecognizer) {
          const g = gestureRecognizer.recognizeForVideo(video, Date.now());
          let label: string | null = null;
          if (g?.gestures && g.gestures.length > 0 && g.gestures[0].length > 0) {
            const top = g.gestures[0][0];
            if (top?.score >= 0.5) label = top.categoryName;
          }
          if (label && faceOverlay) {
            const map: Record<string, string> = {
              'Open_Palm': '手のひら',
              'Closed_Fist': 'グー',
              'Pointing_Up': '上を指差し',
              'Thumb_Up': 'いいね',
              'Thumb_Down': 'だめ',
              'Victory': 'ピース',
              'ILoveYou': 'アイラブユー'
            };
            setGestureOverlay({
              x: faceOverlay.x,
              y: faceOverlay.y - 60,
              text: map[label] || label
            });
          } else {
            setGestureOverlay(null);
          }
        }
      } catch {}
      rafId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafId);
  }, [isAnalyzing, gestureRecognizer, faceOverlay]);

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
          appendEmotionLog({
            dominant_emotion: result?.dominant_emotion ?? null,
            age: result?.age ?? null,
            dominant_gender: result?.dominant_gender ?? null,
            dominant_race: result?.dominant_race ?? null,
          });
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
              // 感情を日本語に変換
              const emotionToJapanese = {
                'angry': '怒り',
                'disgust': '嫌悪',
                'fear': '恐れ',
                'happy': '喜び',
                'sad': '悲しみ',
                'surprise': '驚き',
                'neutral': '無表情'
              };
              
              setFaceOverlay({
                x: noseTip.x * video.clientWidth,
                y: (noseTip.y * video.clientHeight) - 50,
                text: emotionToJapanese[analysisResult.dominant_emotion as keyof typeof emotionToJapanese] || analysisResult.dominant_emotion
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
        <button className="mode-toggle" onClick={toggleRecognitionMode} title="音声認識モード切替">
          認識モード: {recognitionMode === 'server' ? 'サーバー(faster‑whisper)' : 'ブラウザ(Web Speech)'}
        </button>
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
                top: `${faceOverlay.y - 50}px`, // さらに上に配置
                left: `${faceOverlay.x}px`,
                transform: 'translate(-50%, -100%)'
              }}
            >
              {faceOverlay.text}
            </div>
          )}
          {gestureOverlay && (
            <div 
              className="ar-overlay gesture-overlay"
              style={{
                position: 'absolute',
                top: `${gestureOverlay.y - 50}px`,
                left: `${gestureOverlay.x}px`,
                transform: 'translate(-50%, -100%)'
              }}
            >
              {gestureOverlay.text}
            </div>
          )}
        </div>
        <div className="controls">
          <button 
            onClick={handleToggleAnalysis}
            disabled={!faceLandmarker}
            className={isAnalyzing ? 'active' : ''}>
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

          <div 
            className="transcript-container"
            style={{
              position: 'absolute',
              top: faceOverlay ? `${faceOverlay.y + 250}px` : '50%', // あごの下に表示するため下方向にオフセット
              left: faceOverlay ? `${faceOverlay.x}px` : '80%',
              transform: 'translate(-50%, 0)', // 中央揃えだけ維持
              transition: 'all 0.3s ease-out'
            }}
          >
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
          
          {recognitionMode === 'browser' && (
          <div 
            className="transcript-container"
            style={{
              position: 'absolute',
              top: faceOverlay ? `${faceOverlay.y + 300}px` : '50%',
              left: faceOverlay ? `${faceOverlay.x}px` : '80%',
              transform: 'translate(-50%, 0)',
              transition: 'all 0.3s ease-out'
            }}
          >
            <h3>音声認識（ブラウザ） {isRecording && <span className="recording-indicator">●認識中</span>}</h3>
            <div className="transcription-segments">
              {transcript.text ? (
                <div className="transcription-segment">
                  <p className="text">{transcript.text}</p>
                </div>
              ) : (
                <p className="no-results">ここに音声認識結果が表示されます</p>
              )}
            </div>
          </div>
          )}

          {error && <p className="error-message">エラー: {error}</p>}
        </div>
      </header>
    </div>
  );
}

export default App;
