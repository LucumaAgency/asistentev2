import React, { useState, useEffect } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import axios from 'axios';
import '../styles/Login.css';

const Login = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Obtener el Client ID desde variable de entorno
  // IMPORTANTE: Este es el Client ID correcto para producción
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '606663436324-dlr0e9c22kel23s9l4eaum6ivculok1s.apps.googleusercontent.com';
  
  // Log para debug
  console.log('Google Client ID:', googleClientId);
  
  if (!googleClientId || googleClientId.includes('your-client-id')) {
    console.error('Google Client ID no está configurado correctamente');
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="error-message">
            Error: Google OAuth no está configurado correctamente.
            Por favor, contacta al administrador.
          </div>
        </div>
      </div>
    );
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setIsLoading(true);
    setError('');
    
    try {
      // Enviar el token a nuestro backend
      const response = await axios.post('/api/auth/google', {
        credential: credentialResponse.credential
      });

      if (response.data.success) {
        // Guardar tokens en localStorage
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('refreshToken', response.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        // Configurar axios para incluir el token en futuras peticiones
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        
        // Llamar callback de éxito
        onLoginSuccess(response.data.user);
      }
    } catch (error) {
      console.error('Error en login:', error);
      setError(error.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Error al iniciar sesión con Google');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>AI Assistant v2</h1>
          <p>Inicia sesión para guardar tus conversaciones y modos personalizados</p>
        </div>

        <div className="login-body">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <GoogleOAuthProvider clientId={googleClientId}>
            <div className="google-login-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                text="signin_with"
                shape="rectangular"
                theme="filled_blue"
                size="large"
                logo_alignment="left"
                width="300"
                locale="es"
              />
            </div>
          </GoogleOAuthProvider>

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
          </p>
        </div>

        <div className="login-footer">
          <p>
            Al iniciar sesión, aceptas nuestros términos de servicio y política de privacidad
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;