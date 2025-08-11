const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

class GoogleCalendarService {
  constructor() {
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/oauth-callback.html'
    );
    
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  // Configurar el token de acceso para el usuario actual
  setCredentials(tokens) {
    console.log('🔐 GoogleCalendarService: Configurando credenciales');
    console.log('   Access Token:', tokens.access_token ? `${tokens.access_token.substring(0, 20)}...` : 'NO HAY TOKEN');
    console.log('   Refresh Token:', tokens.refresh_token ? 'Presente' : 'NO HAY REFRESH TOKEN');
    this.oauth2Client.setCredentials(tokens);
  }

  // Obtener la URL de autorización con scopes de Calendar
  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  // Intercambiar código por tokens
  async getTokens(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  // Listar eventos del calendario
  async listEvents(timeMin = new Date().toISOString(), maxResults = 10) {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      return response.data.items;
    } catch (error) {
      console.error('Error listando eventos:', error);
      throw error;
    }
  }

  // Crear un evento con Google Meet
  async createEvent(eventDetails) {
    console.log('📅 GoogleCalendarService.createEvent llamado');
    console.log('   Detalles del evento:', eventDetails);
    
    try {
      const event = {
        summary: eventDetails.title,
        description: eventDetails.description || '',
        start: {
          dateTime: this.combineDateAndTime(eventDetails.date, eventDetails.time),
          timeZone: 'America/Mexico_City', // Ajustar según la zona horaria del usuario
        },
        end: {
          dateTime: this.calculateEndTime(
            eventDetails.date, 
            eventDetails.time, 
            eventDetails.duration || 30
          ),
          timeZone: 'America/Mexico_City',
        },
        attendees: eventDetails.attendees ? 
          eventDetails.attendees.map(email => ({ email })) : [],
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 },
          ],
        },
      };

      console.log('🚀 Intentando crear evento en Google Calendar...');
      console.log('   Evento a crear:', JSON.stringify(event, null, 2));
      
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all' // Enviar invitaciones a los asistentes
      });

      console.log('✅ EVENTO CREADO EXITOSAMENTE EN GOOGLE CALENDAR');
      console.log('   ID del evento:', response.data.id);
      console.log('   Link del calendario:', response.data.htmlLink);
      console.log('   Link de Meet:', response.data.conferenceData?.entryPoints?.[0]?.uri);

      return {
        success: true,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        meetLink: response.data.conferenceData?.entryPoints?.[0]?.uri || null,
        event: response.data
      };
    } catch (error) {
      console.error('❌ ERROR CREANDO EVENTO EN GOOGLE CALENDAR:');
      console.error('   Mensaje:', error.message);
      console.error('   Código:', error.code);
      console.error('   Detalles:', error.response?.data || error);
      throw error;
    }
  }

  // Verificar disponibilidad
  async checkAvailability(date, time, duration = 30) {
    try {
      const startTime = this.combineDateAndTime(date, time);
      const endTime = this.calculateEndTime(date, time, duration);
      
      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: startTime,
          timeMax: endTime,
          items: [{ id: 'primary' }]
        }
      });

      const busy = response.data.calendars.primary.busy || [];
      const isAvailable = busy.length === 0;
      
      return {
        available: isAvailable,
        conflicts: busy.map(slot => ({
          start: new Date(slot.start).toLocaleString('es-ES'),
          end: new Date(slot.end).toLocaleString('es-ES')
        }))
      };
    } catch (error) {
      console.error('Error verificando disponibilidad:', error);
      throw error;
    }
  }

  // Actualizar un evento
  async updateEvent(eventId, updates) {
    try {
      const response = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        resource: updates
      });
      
      return response.data;
    } catch (error) {
      console.error('Error actualizando evento:', error);
      throw error;
    }
  }

  // Eliminar un evento
  async deleteEvent(eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendUpdates: 'all'
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error eliminando evento:', error);
      throw error;
    }
  }

  // Funciones auxiliares
  combineDateAndTime(date, time) {
    return `${date}T${time}:00`;
  }

  calculateEndTime(date, time, durationMinutes) {
    const startDateTime = new Date(`${date}T${time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);
    return endDateTime.toISOString();
  }

  // Obtener eventos del día
  async getTodayEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.listEvents(today.toISOString(), 20);
  }

  // Buscar próximo horario disponible
  async findNextAvailableSlot(duration = 30, startSearchFrom = new Date()) {
    try {
      const searchEnd = new Date(startSearchFrom);
      searchEnd.setDate(searchEnd.getDate() + 7); // Buscar en los próximos 7 días
      
      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: startSearchFrom.toISOString(),
          timeMax: searchEnd.toISOString(),
          items: [{ id: 'primary' }]
        }
      });

      const busy = response.data.calendars.primary.busy || [];
      
      // Lógica para encontrar el próximo slot disponible
      // Considerando horario laboral (9 AM - 6 PM)
      let currentTime = new Date(startSearchFrom);
      currentTime.setMinutes(Math.ceil(currentTime.getMinutes() / 30) * 30); // Redondear a próximos 30 min
      
      while (currentTime < searchEnd) {
        const hour = currentTime.getHours();
        
        // Solo considerar horario laboral
        if (hour >= 9 && hour < 18) {
          const slotEnd = new Date(currentTime.getTime() + duration * 60000);
          
          // Verificar si este slot está libre
          const isConflict = busy.some(busySlot => {
            const busyStart = new Date(busySlot.start);
            const busyEnd = new Date(busySlot.end);
            return (currentTime >= busyStart && currentTime < busyEnd) ||
                   (slotEnd > busyStart && slotEnd <= busyEnd);
          });
          
          if (!isConflict) {
            return {
              available: true,
              suggestedTime: currentTime.toISOString(),
              suggestedTimeFormatted: currentTime.toLocaleString('es-ES')
            };
          }
        }
        
        // Avanzar 30 minutos
        currentTime.setMinutes(currentTime.getMinutes() + 30);
        
        // Si es después de las 6 PM, saltar al siguiente día a las 9 AM
        if (currentTime.getHours() >= 18) {
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(9, 0, 0, 0);
        }
      }
      
      return {
        available: false,
        message: 'No hay horarios disponibles en los próximos 7 días'
      };
    } catch (error) {
      console.error('Error buscando horario disponible:', error);
      throw error;
    }
  }
}

module.exports = GoogleCalendarService;