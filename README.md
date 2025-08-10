# AI Assistant Web - Plesk Deployment

Aplicación web de asistente de IA con soporte de voz, diseñada para desplegarse en Plesk con CI/CD automatizado.

## 🚀 Características

- **Chat con IA**: Interfaz de conversación con OpenAI GPT-4
- **Soporte de voz**: Reconocimiento y síntesis de voz integrados
- **Base de datos**: MariaDB/MySQL con fallback a memoria
- **CI/CD**: GitHub Actions para despliegue automatizado
- **Optimizado para Plesk**: Configuración específica para hosting Plesk

## 📋 Requisitos

- Node.js 18+ (configurado en Plesk)
- MariaDB/MySQL
- Cuenta de OpenAI con API key
- Repositorio en GitHub
- Hosting con Plesk

## 🛠️ Instalación Local

1. **Clonar el repositorio**
```bash
git clone <tu-repositorio>
cd ai-assistant-plesk
```

2. **Instalar dependencias**
```bash
npm run install:all
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

4. **Configurar base de datos**
```sql
mysql -u root -p < database/schema.sql
```

5. **Iniciar en desarrollo**
```bash
npm run dev
```

## 🚀 Despliegue en Plesk

### Configuración Inicial

1. **En GitHub:**
   - Fork o clona este repositorio
   - Ve a Settings → Secrets → Actions
   - No se requieren secrets adicionales

2. **En Plesk:**
   - Crear nueva aplicación Node.js
   - Configurar Git:
     - URL del repositorio: `https://github.com/tu-usuario/tu-repo`
     - Rama: `production` (⚠️ NO main)
     - Deploy automático: Activar (opcional)

3. **Configuración Node.js en Plesk:**
   - Archivo de inicio: `server.js`
   - Directorio raíz de la aplicación: `/`
   - Directorio raíz del documento: `/frontend/dist`
   - Modo de aplicación: `production`

4. **Variables de entorno en Plesk:**
```
DB_HOST=localhost
DB_USER=tu_usuario_db
DB_PASSWORD=tu_password_db
DB_NAME=ai_assistant_db
PORT=3001
OPENAI_API_KEY=tu_api_key_openai
NODE_ENV=production
```

5. **Base de datos en Plesk:**
   - Crear base de datos desde phpMyAdmin
   - Importar `database/schema.sql`
   - O dejar que la app cree las tablas automáticamente

### Flujo de Despliegue

1. **Desarrollo:**
   - Hacer cambios en rama `main`
   - Commit y push

2. **CI/CD Automático:**
   - GitHub Actions se ejecuta
   - Compila el frontend
   - Crea/actualiza rama `production`

3. **Plesk:**
   - Detecta cambios en `production`
   - Pull automático o manual
   - Ejecutar "NPM install" si hay nuevas dependencias

## 📁 Estructura del Proyecto

```
ai-assistant-plesk/
├── frontend/               # React + Vite
│   ├── src/               # Código fuente
│   └── dist/              # Build (en rama production)
├── database/              # Scripts SQL
├── server.js              # Servidor Express
├── package.json           # Dependencias backend
├── .env.example           # Plantilla de variables
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Actions CI/CD
└── .plesk-*.sh           # Scripts de utilidad
```

## 🔧 Scripts Disponibles

### NPM Scripts
- `npm start` - Inicia el servidor en producción
- `npm run dev` - Desarrollo con hot reload
- `npm run build` - Compila el frontend
- `npm run install:all` - Instala todas las dependencias

### Scripts de Plesk
- `.plesk-deploy.sh` - Deploy completo con detección de npm
- `.plesk-deploy-simple.sh` - Verificación simple
- `.plesk-test.sh` - Diagnóstico del entorno

## 🔍 Solución de Problemas

### Base de datos no conecta
- Verificar credenciales en variables de entorno
- Comprobar que el servicio MySQL está activo
- La app usa memoria como fallback si DB falla

### Frontend no se muestra
- Verificar que `frontend/dist` existe
- Ejecutar build: `cd frontend && npm run build`
- Comprobar la rama `production` tiene los archivos

### Error de npm en Plesk
- Usar "NPM install" desde el panel de Plesk
- No usar `npm install` por SSH si no está en PATH

### OpenAI no responde
- Verificar API key en variables de entorno
- Comprobar límites de la cuenta OpenAI
- Ver logs en Plesk → Node.js → Logs

## 📊 Endpoints API

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/health` | GET | Estado del servidor |
| `/api/db-test` | GET | Test de conexión DB |
| `/api/chat` | POST | Enviar mensaje al chat |
| `/api/conversations/:id` | GET | Obtener conversación |
| `/api/conversations/:id` | DELETE | Eliminar conversación |

## 🔐 Seguridad

- Rate limiting implementado
- Helmet.js para headers seguros
- Variables sensibles en .env
- CORS configurado
- Sanitización de entradas

## 📝 Notas de Desarrollo

- El frontend usa Vite para desarrollo rápido
- Hot reload disponible en desarrollo
- La base de datos se crea automáticamente
- Sistema de fallback si MariaDB no está disponible
- Logs detallados para debugging

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

Este proyecto está bajo licencia MIT. Ver `LICENSE` para más detalles.

## 🆘 Soporte

Para problemas o preguntas:
1. Revisar la sección de solución de problemas
2. Buscar en issues existentes
3. Crear nuevo issue con detalles del problema

---

**Desarrollado para despliegue optimizado en Plesk con CI/CD automatizado**# Trigger workflow Sun Aug 10 18:54:16 UTC 2025
