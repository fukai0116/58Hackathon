import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { analyzeEmotion } from './services/api';
import './App.css';

const videoConstraints = {
  width: 720,
  height: 480,
  facingMode: 'user',
};

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

  const handleToggleAnalysis = () => {
    setIsAnalyzing(prev => !prev);
    if (isAnalyzing) {
      setAnalysisResult(null);
      setError(null);
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
        } finally {
          isLoadingRef.current = false;
        }
      }
    }, 500); // 500ms = 0.5 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [isAnalyzing]);

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
        </div>
        <button onClick={handleToggleAnalysis}>
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