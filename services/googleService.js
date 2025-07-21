// Bestand: services/googleService.js

import { google } from 'googleapis';
import { pool } from '../db.js';

export async function getAuthenticatedClient(userId) {
	const result = await pool.query('SELECT tokens FROM users WHERE id = $1', [userId]);
	if (!result.rows.length) throw new Error('User not found');
	const { tokens } = result.rows[0];
	const auth = new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID,
		process.env.GOOGLE_CLIENT_SECRET,
		process.env.GOOGLE_REDIRECT_URI
	);
	auth.setCredentials(tokens);
	auth.on('tokens', refreshed => {
		const newTokens = { ...tokens, ...refreshed };
		pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [newTokens, userId]).catch(console.error);
	});
	return auth;
}

export async function getBusySlots(auth, calendarId, timeMin, timeMax) {
    const calendar = google.calendar({ version: 'v3', auth });
    try {
        const resp = await calendar.events.list({
            calendarId: calendarId || 'primary',
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        return (resp.data.items || []).reduce((acc, e) => {
            if (e.start?.dateTime && e.end?.dateTime && e.transparency !== 'transparent' && e.status === 'confirmed') {
                const start = new Date(e.start.dateTime);
                const end = new Date(e.end.dateTime);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    acc.push({ start, end, location: e.location });
                }
            }
            return acc;
        }, []);

    } catch (err) {
        console.warn('Calendar fetch failed → busySlots=[]', err.message);
        return [];
    }
}

export async function bookAppointmentInGoogleCalendar(link, appointmentDetails) {
    const { startTime, name, email, destinationAddress, phone, comments } = appointmentDetails;
    const auth = await getAuthenticatedClient(link.user_id);
    const calendar = google.calendar({ version: 'v3', auth });
    
    const appointmentStart = new Date(startTime);
    const appointmentEnd = new Date(appointmentStart.getTime() + link.duration * 60000);

    let finalDescription = link.description || '';
    if (comments) {
        if (finalDescription) finalDescription += '\n\n---\n\n';
        finalDescription += `Opmerkingen van de klant:\n${comments}`;
    }
    finalDescription += `\n\n---\nIngepland door: ${name} (${email}, ${phone})`;

    const mainEvent = {
        summary: link.title,
        description: finalDescription,
        location: destinationAddress,
        start: { dateTime: appointmentStart.toISOString(), timeZone: 'Europe/Amsterdam' },
        end: { dateTime: appointmentEnd.toISOString(), timeZone: 'Europe/Amsterdam' },
        attendees: [{ email }],
        reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 24 * 60 }, { method: 'popup', minutes: 10 }] },
    };
    
    return await calendar.events.insert({ 
        calendarId: link.calendar_id || 'primary', 
        resource: mainEvent, 
        sendNotifications: true 
    });
}