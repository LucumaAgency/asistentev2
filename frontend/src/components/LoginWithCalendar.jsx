import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/Login.css';

// Configurar axios baseURL
if (!axios.defaults.baseURL) {
  axios.defaults.baseURL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : '';
}

const LoginWithCalendar = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOAuthCallback = async (code) => {
    setIsLoading(true);
    setError('');
    
    console.log('LoginWithCalendar - Procesando código OAuth:', code.substring(0, 20) + '...');
    
    try {
      const response = await axios.post('/api/auth/google', { code });
      
      console.log('LoginWithCalendar - Respuesta del servidor:', response.data);
      
      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('refreshToken', response.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        
        console.log('LoginWithCalendar - Datos guardados:', {
          hasToken: !!response.data.token,
          hasRefreshToken: !!response.data.refreshToken,
          user: response.data.user,
          hasCalendarAccess: response.data.hasCalendarAccess
        });
        
        // Limpiar URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        onLoginSuccess(response.data.user);
      }
    } catch (err) {
      console.error('Error en OAuth callback:', err);
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Verificar si hay código en la URL (callback de OAuth)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      handleOAuthCallback(code);
    }
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      console.log('Solicitando URL de autorización con Calendar...');
      // SIEMPRE obtener URL de autorización con scopes de Calendar
      const response = await axios.get('/api/auth/google/auth-url');
      console.log('Respuesta del servidor:', response.data);
      
      const { authUrl } = response.data;
      
      if (!authUrl) {
        throw new Error('No se recibió URL de autorización del servidor');
      }
      
      console.log('Redirigiendo a Google OAuth con permisos de Calendar...');
      // Redirigir a Google OAuth - esto pedirá permisos de Calendar desde el inicio
      window.location.href = authUrl;
    } catch (err) {
      console.error('Error completo:', err);
      console.error('Respuesta del error:', err.response);
      
      const errorMessage = err.response?.data?.error || err.message || 'Error al iniciar el proceso de autenticación';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Asistente IA v3.40</h1>
          <p>Inicia sesión para guardar tus conversaciones y acceder a todas las funciones</p>
        </div>

        <div className="login-body">
          {error && (
            <div className="error-message">{error}</div>
          )}
          
          <button 
            className="google-login-button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <>Procesando...</>
            ) : (
              <>
                <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Iniciar sesión con Google
              </>
            )}
          </button>
          
          <div className="login-features">
            <h3>Al iniciar sesión obtendrás:</h3>
            <ul>
              <li>✅ Guardado permanente de conversaciones</li>
              <li>📅 Integración con Google Calendar</li>
              <li>🎯 Modos personalizados</li>
              <li>🧠 Memoria contextual</li>
            </ul>
          </div>

          <div className="login-divider">
            <span>o</span>
          </div>

          <button 
            className="guest-button"
            onClick={() => onLoginSuccess(null)}
            disabled={isLoading}
          >
            Continuar como invitado
          </button>
          
          <p className="login-note">
            Al continuar como invitado, tus conversaciones no se guardarán permanentemente
            y no tendrás acceso a la integración con Calendar
          </p>
        </div>

        <div className="login-footer">
          <p>Al iniciar sesión, aceptas nuestros términos de servicio y política de privacidad</p>
        </div>
      </div>
    </div>
  );
};

export default LoginWithCalendar;