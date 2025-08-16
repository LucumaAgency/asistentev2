import React, { useState, useEffect, useRef } from 'react';
import './VoiceAssistant.css';

const VoiceAssistant = () => {
  const [showExitButton, setShowExitButton] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setError(null);
        startAudioVisualization();
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setTranscript(transcript);
        handleVoiceCommand(transcript);
      };

      recognitionRef.current.onerror = (event) => {
        setError(`Error de reconocimiento: ${event.error}`);
        setIsListening(false);
        stopAudioVisualization();
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        stopAudioVisualization();
      };
    } else {
      setError('Tu navegador no soporta reconocimiento de voz');
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          const average = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;
          setAudioLevel(average / 255);
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('No se pudo acceder al micrófono');
    }
  };

  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  const handleVoiceCommand = async (text) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: text,
          mode_id: 'general',
          conversation_id: null
        })
      });

      if (!response.ok) throw new Error('Error en la respuesta del servidor');

      const data = await response.json();
      speakResponse(data.response);
    } catch (error) {
      console.error('Error:', error);
      speakResponse('Lo siento, hubo un error al procesar tu solicitud.');
    }
  };

  const speakResponse = (text) => {
    if ('speechSynthesis' in window) {
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setTimeout(() => {
          startListening();
        }, 500);
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setError('Error al reproducir la respuesta');
      };

      synthRef.current.cancel();
      synthRef.current.speak(utterance);
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isSpeaking) {
      setTranscript('');
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else if (!isSpeaking) {
      startListening();
    }
  };

  const getCircleScale = () => {
    if (isSpeaking) {
      return 1 + Math.sin(Date.now() * 0.005) * 0.1;
    }
    return 1 + audioLevel * 0.5;
  };

  const handleExit = () => {
    window.location.reload();
  };

  return (
    <div className="voice-assistant-container">
      {showExitButton && (
        <button 
          className="exit-voice-button"
          onClick={handleExit}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '2px solid #5d8ffc',
            color: '#5d8ffc',
            padding: '10px 20px',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s ease',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#5d8ffc';
            e.target.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.9)';
            e.target.style.color = '#5d8ffc';
          }}
        >
          ← Volver al chat
        </button>
      )}
      <div className="voice-content">
        <div 
          className={`voice-circle ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}
          onClick={toggleListening}
          style={{
            transform: `scale(${getCircleScale()})`,
            boxShadow: isListening || isSpeaking 
              ? `0 0 ${30 + audioLevel * 50}px rgba(93, 143, 252, ${0.4 + audioLevel * 0.3})`
              : '0 0 20px rgba(93, 143, 252, 0.3)'
          }}
        >
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay-1"></div>
          <div className="pulse-ring delay-2"></div>
          
          <svg className="mic-icon" viewBox="0 0 24 24" width="60" height="60">
            <path 
              fill="white" 
              d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"
            />
            <path 
              fill="white" 
              d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
            />
          </svg>
        </div>

        <div className="status-text">
          {isSpeaking && <p className="status">Hablando...</p>}
          {isListening && !isSpeaking && <p className="status">Escuchando...</p>}
          {!isListening && !isSpeaking && <p className="status">Toca para hablar</p>}
          {transcript && <p className="transcript">"{transcript}"</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="instructions">
          <p>Haz clic en el círculo para activar el asistente de voz</p>
          <p className="subtitle">Habla claramente y espera la respuesta</p>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;