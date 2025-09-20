import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { analyzeEmotion } from './services/api';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import './App.css';

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
        <button 
          onClick={handleToggleAnalysis}
          disabled={!faceLandmarker}>
          {isAnalyzing ? 'Stop Analysis' : 'Start Analysis'}
        </button>
        <div className="results">
          {analysisResult?.dominant_emotion && (
            <p className="emotion-result">
              Detected Emotion: <span>{analysisResult.dominant_emotion}</span>
            </p>
          )}
          <div className="other-results">
            {analysisResult?.age && <p>Age: <span>{analysisResult.age}</span></p>}
            {analysisResult?.dominant_gender && <p>Gender: <span>{analysisResult.dominant_gender}</span></p>}
            {analysisResult?.dominant_race && <p>Race: <span>{analysisResult.dominant_race}</span></p>}
          </div>
          {error && <p className="error-message">Error: {error}</p>}
        </div>
      </header>
    </div>
  );
}

export default App;