// ---------- Insert Your Data ---------- //

const BOT_TOKEN = "8998444861:AAECB2x74--B-ONku-FUFt19K_fSYDs2R4U"; 
const BOT_WEBHOOK = "/endpoint"; 
const BOT_SECRET = "BOT_SECRET"; 
const BOT_OWNER = 8731089917; 
const BOT_CHANNEL = -1004424431993; 
const SIA_SECRET = "SIA_SECRET"; 
const PUBLIC_BOT = false; 

// 🚀 NAYA UPGRADE: LOCAL API SERVER (For Big Files) 🚀
// Default: "https://api.telegram.org"
// Agar 20MB se badi files stream karni hain, toh apna Local Bot API Server yahan daal
const TG_API_BASE = "https://api.telegram.org"; 

// ---------- Do Not Modify ---------- // 

const WHITE_METHODS = ["GET", "POST", "HEAD"];
const HEADERS_FILE = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Range"};
const HEADERS_ERRR = {'Access-Control-Allow-Origin': '*', 'content-type': 'application/json'};
const ERROR_404 = {"ok":false,"error_code":404,"description":"Bad Request: missing /?file= parameter"};
const ERROR_405 = {"ok":false,"error_code":405,"description":"Bad Request: method not allowed"};
const ERROR_406 = {"ok":false,"error_code":406,"description":"Bad Request: file type invalid"};
const ERROR_407 = {"ok":false,"error_code":407,"description":"Bad Request: file hash invalid by atob"};
const ERROR_408 = {"ok":false,"error_code":408,"description":"Bad Request: mode not in [attachment, inline, watch]"};

// ---------- Event Listener (ES Module Format) ---------- // 

export default {
    async fetch(request, env, ctx) {
        return await handleRequest(request, ctx);
    }
};

async function handleRequest(request, ctx) {
    const url = new URL(request.url);
    const file = url.searchParams.get('file');
    const mode = url.searchParams.get('mode') || "attachment";
     
    if (url.pathname === BOT_WEBHOOK) {return Bot.handleWebhook(request, ctx)}
    if (url.pathname === '/registerWebhook') {return Bot.registerWebhook(request, url, BOT_WEBHOOK, BOT_SECRET)}
    if (url.pathname === '/unregisterWebhook') {return Bot.unregisterWebhook()}
    if (url.pathname === '/getMe') {return new Response(JSON.stringify(await Bot.getMe()), {headers: HEADERS_ERRR, status: 202})}

    if (!file) {return Raise(ERROR_404, 404);}
    if (!["attachment", "inline", "watch"].includes(mode)) {return Raise(ERROR_408, 404)}
    if (!WHITE_METHODS.includes(request.method)) {return Raise(ERROR_405, 405);}
    try {await Cryptic.deHash(file)} catch {return Raise(ERROR_407, 404)}

    if (mode === "watch") {
        const streamUrl = `${url.origin}/?file=${file}&mode=inline`;
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Premium Stream</title>
            <link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" />
            <style>
                :root { --plyr-color-main: #e50914; --plyr-video-background: #000; --plyr-font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                body { margin: 0; padding: 0; background-color: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
                .video-wrapper { width: 100vw; height: 100vh; }
                video { width: 100%; height: 100%; }
            </style>
        </head>
        <body>
            <div class="video-wrapper">
                <video id="premium-player" playsinline controls preload="metadata">
                    <source src="${streamUrl}" type="video/mp4" />
                    Your browser does not support the premium player.
                </video>
            </div>
            <script src="https://cdn.plyr.io/3.7.8/plyr.js"></script>
            <script>
                document.addEventListener('DOMContentLoaded', () => {
                    const player = new Plyr('#premium-player', {
                        controls: ['play-large', 'restart', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'],
                        settings: ['speed', 'loop'],
                        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
                        keyboard: { focused: true, global: true },
                        tooltips: { controls: true, seek: true },
                        clickToPlay: true
                    });
                });
            </script>
        </body>
        </html>`;
        
        return new Response(html, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" }
        });
    }

    const channel_id = BOT_CHANNEL;
    const file_id = await Cryptic.deHash(file);
    const retrieve = await RetrieveFile(channel_id, file_id, request);
    if (retrieve.error_code) {return await Raise(retrieve, retrieve.error_code)};

    const tgResponse = retrieve[0]; 
    const rname = retrieve[1];
    const rsize = retrieve[2];
    const rtype = retrieve[3];

    const responseHeaders = new Headers(tgResponse.headers);
    responseHeaders.set("Content-Disposition", `${mode}; filename="${rname}"`);
    responseHeaders.set("Content-Type", rtype);
    responseHeaders.set("Accept-Ranges", "bytes"); 

    for (const [key, value] of Object.entries(HEADERS_FILE)) {
        responseHeaders.set(key, value);
    }

    return new Response(tgResponse.body, {
        status: tgResponse.status, 
        headers: responseHeaders
    });
}

// ---------- Retrieve File ---------- //

async function RetrieveFile(channel_id, message_id, request) {
    let  fID; let fName; let fType; let fSize; let fLen;
    let data = await Bot.editMessage(channel_id, message_id, await UUID());
    if (data.error_code){return data}
    
    if (data.document){
        fID = data.document.file_id; fName = data.document.file_name; fType = data.document.mime_type; fSize = data.document.file_size;
    } else if (data.audio) {
        fID = data.audio.file_id; fName = data.audio.file_name; fType = data.audio.mime_type; fSize = data.audio.file_size;
    } else if (data.video) {
        fID = data.video.file_id; fName = data.video.file_name; fType = data.video.mime_type; fSize = data.video.file_size;
    } else if (data.photo) {
        fLen = data.photo.length - 1; fID = data.photo[fLen].file_id; fName = data.photo[fLen].file_unique_id + '.jpg'; fType = "image/jpg"; fSize = data.photo[fLen].file_size;
    } else {
        return ERROR_406
    }

    const file = await Bot.getFile(fID)
    if (file.error_code){return file}

    return [await Bot.fetchFile(file.file_path, request), fName, fSize, fType];
}

// ---------- Raise Error ---------- //

async function Raise(json_error, status_code) {
    return new Response(JSON.stringify(json_error), { headers: HEADERS_ERRR, status: status_code });
}

// ---------- UUID Generator ---------- //

async function UUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ---------- Hash Generator ---------- //

class Cryptic {
  static async getSalt(length = 16) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let salt = '';
    for (let i = 0; i < length; i++) { salt += characters.charAt(Math.floor(Math.random() * characters.length)); }
    return salt;
  }

  static async getKey(salt, iterations = 1000, keyLength = 32) {
    const key = new Uint8Array(keyLength);
    for (let i = 0; i < keyLength; i++) { key[i] = (SIA_SECRET.charCodeAt(i % SIA_SECRET.length) + salt.charCodeAt(i % salt.length)) % 256; }
    for (let j = 0; j < iterations; j++) {
        for (let i = 0; i < keyLength; i++) { key[i] = (key[i] + SIA_SECRET.charCodeAt(i % SIA_SECRET.length) + salt.charCodeAt(i % salt.length)) % 256; }
    }
    return key;
  }

  static async baseEncode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let output = ''; let buffer = 0; let bitsLeft = 0;
    for (let i = 0; i < input.length; i++) {
        buffer = (buffer << 8) | input.charCodeAt(i);
        bitsLeft += 8;
        while (bitsLeft >= 5) {output += alphabet[(buffer >> (bitsLeft - 5)) & 31]; bitsLeft -= 5}
    }
    if (bitsLeft > 0) {output += alphabet[(buffer << (5 - bitsLeft)) & 31]}
    return output;
  }

  static async baseDecode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const lookup = {};
    for (let i = 0; i < alphabet.length; i++) {lookup[alphabet[i]] = i}
    let buffer = 0; let bitsLeft = 0; let output = '';
    for (let i = 0; i < input.length; i++) {
        buffer = (buffer << 5) | lookup[input[i]];
        bitsLeft += 5;
        if (bitsLeft >= 8) {output += String.fromCharCode((buffer >> (bitsLeft - 8)) & 255); bitsLeft -= 8}
    }
    return output;
  }

  static async Hash(text) {
    const salt = await this.getSalt();
    const key = await this.getKey(salt);
    const encoded = String(text).split('').map((char, index) => {
        return String.fromCharCode(char.charCodeAt(0) ^ key[index % key.length]);
    }).join('');
    return await this.baseEncode(salt + encoded);
  }

  static async deHash(hashed) {
    const decoded = await this.baseDecode(hashed);
    const salt = decoded.substring(0, 16);
    const encoded = decoded.substring(16);
    const key = await this.getKey(salt);
    const text = encoded.split('').map((char, index) => {
        return String.fromCharCode(char.charCodeAt(0) ^ key[index % key.length]);
    }).join('');
    return text;
  }
}

// ---------- Telegram Bot ---------- //

class Bot {
  static async handleWebhook(request, ctx) {
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== BOT_SECRET) {
      return new Response('Unauthorized', { status: 403 })
    }
    const update = await request.json()
    ctx.waitUntil(this.Update(request, update))
    return new Response('Ok')
  }

  static async registerWebhook(request, requestUrl, suffix, secret) {
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
    const response = await fetch(await this.apiUrl('setWebhook', { url: webhookUrl, secret_token: secret }))
    return new Response(JSON.stringify(await response.json()), {headers: HEADERS_ERRR})
  }

  static async unregisterWebhook() { 
    const response = await fetch(await this.apiUrl('setWebhook', { url: '' }))
    return new Response(JSON.stringify(await response.json()), {headers: HEADERS_ERRR})
  }

  static async getMe() {
    const response = await fetch(await this.apiUrl('getMe'))
    if (response.status == 200) {return (await response.json()).result;
    } else {return await response.json()}
  }

  static async sendMessage(chat_id, reply_id, text, reply_markup=[]) {
    const response = await fetch(await this.apiUrl('sendMessage', {chat_id: chat_id, reply_to_message_id: reply_id, parse_mode: 'markdown', text, reply_markup: JSON.stringify({inline_keyboard: reply_markup})}))
    if (response.status == 200) {return (await response.json()).result;
    } else {return await response.json()}
  }

  static async sendDocument(chat_id, file_id) {
    const response = await fetch(await this.apiUrl('sendDocument', {chat_id: chat_id, document: file_id}))
    if (response.status == 200) {return (await response.json()).result;
    } else {return await response.json()}
  }

  static async sendPhoto(chat_id, file_id) {
    const response = await fetch(await this.apiUrl('sendPhoto', {chat_id: chat_id, photo: file_id}))
    if (response.status == 200) {return (await response.json()).result;
    } else {return await response.json()}
  }

  static async editMessage(channel_id, message_id, caption_text) {
      const response = await fetch(await this.apiUrl('editMessageCaption', {chat_id: channel_id, message_id: message_id, caption: caption_text}))
      if (response.status == 200) {return (await response.json()).result;
      } else {return await response.json()}
  }

  static async answerInlineArticle(query_id, title, description, text, reply_markup=[], id='1') {
    const data = [{type: 'article', id: id, title: title, thumbnail_url: "https://i.ibb.co/5s8hhND/dac5fa134448.png", description: description, input_message_content: {message_text: text, parse_mode: 'markdown'}, reply_markup: {inline_keyboard: reply_markup}}];
    const response = await fetch(await this.apiUrl('answerInlineQuery', {inline_query_id: query_id, results: JSON.stringify(data), cache_time: 1}))
    if (response.status == 200) {return (await response.json()).result;
    } else {return await response.json()}
  }

  static async answerInlineDocument(query_id, title, file_id, mime_type, reply_markup=[], id='1') {
    const data = [{type: 'document', id: id, title: title, document_file_id: file_id, mime_type: mime_type, description: mime_type, reply_markup: {inline_keyboard: reply_markup}}];
    const response = await fetch(await this.apiUrl('answerInlineQuery', {inline_query_id: query_id, results: JSON.stringify(data), cache_time: 1}))
    if (response.status == 200) {return (await response.json()).result;
    } else {return await response.json()}
  }

  static async answerInlinePhoto(query_id, title, photo_id, reply_markup=[], id='1') {
    const data = [{type: 'photo', id: id, title: title, photo_file_id: photo_id, reply_markup: {inline_keyboard: reply_markup}}];
    const response = await fetch(await this.apiUrl('answerInlineQuery', {inline_query_id: query_id, results: JSON.stringify(data), cache_time: 1}))
    if (response.status == 200) {return (await response.json()).result;
    } else {return await response.json()}
  }

  static async getFile(file_id) {
      const response = await fetch(await this.apiUrl('getFile', {file_id: file_id}))
      if (response.status == 200) {return (await response.json()).result;
      } else {return await response.json()}
  }

  // 🚀 NAYA UPGRADE: BASE URL CHANGE KIYA HAI YAHAN 🚀
  static async fetchFile(file_path, request) {
      const headers = {};
      if (request && request.headers.has('range')) { headers['range'] = request.headers.get('range'); }
      const response = await fetch(`${TG_API_BASE}/file/bot${BOT_TOKEN}/${file_path}`, { headers });
      return response; 
  }

  // 🚀 NAYA UPGRADE: BASE URL CHANGE KIYA HAI YAHAN 🚀
  static async apiUrl (methodName, params = null) {
      let query = ''
      if (params) {query = '?' + new URLSearchParams(params).toString()}
      return `${TG_API_BASE}/bot${BOT_TOKEN}/${methodName}${query}`
  }

  static async Update(request, update) {
    if (update.inline_query) {await onInline(request, update.inline_query)}
    if ('message' in update) {await onMessage(request, update.message)}
  }
}

// ---------- Inline Listener ---------- // 

async function onInline(request, inline) {
  let  fID; let fName; let fType; let fSize; let fLen;

  if (!PUBLIC_BOT && inline.from.id != BOT_OWNER) {
    const buttons = [[{ text: "Source Code", url: "https://github.com/vauth/filestream-cf" }]];
    return await Bot.answerInlineArticle(inline.id, "Access forbidden", "Deploy your own bot.", "*❌ Access forbidden.*\n📡 Deploy your own bot.", buttons)
  }
 
  try {await Cryptic.deHash(inline.query)} catch {
    const buttons = [[{ text: "Source Code", url: "https://github.com/vauth/filestream-cf" }]];
    return await Bot.answerInlineArticle(inline.id, "Error", ERROR_407.description, ERROR_407.description, buttons)
  }

  const channel_id = BOT_CHANNEL;
  const message_id = await Cryptic.deHash(inline.query);
  const data = await Bot.editMessage(channel_id, message_id, await UUID());

  if (data.error_code){
    const buttons = [[{ text: "Source Code", url: "https://github.com/vauth/filestream-cf" }]];
    return await Bot.answerInlineArticle(inline.id, "Error", data.description, data.description, buttons)
  }

  if (data.document){
    fID = data.document.file_id; fName = data.document.file_name; fType = data.document.mime_type; fSize = data.document.file_size;
  } else if (data.audio) {
    fID = data.audio.file_id; fName = data.audio.file_name; fType = data.audio.mime_type; fSize = data.audio.file_size;
  } else if (data.video) {
    fID = data.video.file_id; fName = data.video.file_name; fType = data.video.mime_type; fSize = data.video.file_size;
  } else if (data.photo) {
    fLen = data.photo.length - 1; fID = data.photo[fLen].file_id; fName = data.photo[fLen].file_unique_id + '.jpg'; fType = "image/jpg"; fSize = data.photo[fLen].file_size;
  } else {
    return ERROR_406
  }

  if (fType == "image/jpg") {
    const buttons = [[{ text: "Send Again", switch_inline_query_current_chat: inline.query }]]
    return await Bot.answerInlinePhoto(inline.id, fName || "undefined", fID, buttons)
  } else {
    const buttons = [[{ text: "Send Again", switch_inline_query_current_chat: inline.query }]];
    return await Bot.answerInlineDocument(inline.id, fName || "undefined", fID, fType, buttons)
  }
}

// ---------- Message Listener ---------- // 

async function onMessage(request, message) {
  let fID; let fName; let fSave; let fType;
  let url = new URL(request.url);
  let bot = await Bot.getMe();

  if (message.via_bot && message.via_bot.username == bot.username) { return }
  if (message.chat.id.toString().includes("-100")) { return }

  if (message.text && message.text === "/start") {
    const welcomeText = "*👋 Welcome to FileStream Bot!*\n\nSend me any file, video, audio, or photo, and I will generate a direct download and streaming link for you!";
    return Bot.sendMessage(message.chat.id, message.message_id, welcomeText);
  }

  if (message.text && message.text.startsWith("/start ")) {
    const file = message.text.split("/start ")[1]
    try {await Cryptic.deHash(file)} catch {return await Bot.sendMessage(message.chat.id, message.message_id, ERROR_407.description)}

    const channel_id = BOT_CHANNEL;
    const message_id = await Cryptic.deHash(file);
    const data = await Bot.editMessage(channel_id, message_id, await UUID());

    if (data.document) {
      return await Bot.sendDocument(message.chat.id, data.document.file_id)
    } else if (data.audio) {
      return await Bot.sendDocument(message.chat.id, data.audio.file_id)
    } else if (data.video) {
      return await Bot.sendDocument(message.chat.id, data.video.file_id)
    } else if (data.photo) {
      return await Bot.sendPhoto(message.chat.id, data.photo[data.photo.length - 1].file_id)
    } else {
      return Bot.sendMessage(message.chat.id, message.message_id, "Bad Request: File not found")
    }
  }

  if (!PUBLIC_BOT && message.chat.id != BOT_OWNER) {
    const buttons = [[{ text: "Source Code", url: "https://github.com/vauth/filestream-cf" }]];
    return Bot.sendMessage(message.chat.id, message.message_id, "*❌ Access forbidden.*\n📡 Deploy your own bot.", buttons)
  }

  if (message.document){
    fID = message.document.file_id; fName = message.document.file_name || "unknown"; fType = (message.document.mime_type || "unknown/unknown").split("/")[0];
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID)
  } else if (message.audio) {
    fID = message.audio.file_id; fName = message.audio.file_name || "unknown"; fType = (message.audio.mime_type || "unknown/unknown").split("/")[0];
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID)
  } else if (message.video) {
    fID = message.video.file_id; fName = message.video.file_name || "unknown"; fType = (message.video.mime_type || "unknown/unknown").split("/")[0];
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID)
  } else if (message.photo) {
    fID = message.photo[message.photo.length - 1].file_id; fName = message.photo[message.photo.length - 1].file_unique_id + '.jpg'; fType = "image/jpg".split("/")[0];
    fSave = await Bot.sendPhoto(BOT_CHANNEL, fID)
  } else {
    return Bot.sendMessage(message.chat.id, message.message_id, "Send me any file/video/gif/audio *(t<=4GB, e<=20MB)*.")
  }

  if (fSave.error_code) {return Bot.sendMessage(message.chat.id, message.message_id, fSave.description)}

  const final_hash = await Cryptic.Hash(fSave.message_id);
  const final_link = `${url.origin}/?file=${final_hash}`;
  const final_stre = `${url.origin}/?file=${final_hash}&mode=inline`;
  const final_watch = `${url.origin}/?file=${final_hash}&mode=watch`; 
  const final_tele = `https://t.me/${bot.username}/?start=${final_hash}`;

  const buttons = [
    [{ text: "▶️ Premium Watch Online", url: final_watch }],
    [{ text: "Telegram Link", url: final_tele }, { text: "Inline Link", switch_inline_query: final_hash }],
    [{ text: "Stream Link", url: final_stre }, { text: "Download Link", url: final_link }]
  ];

  let final_text = `*🗂 File Name:* \`${fName}\`\n*⚙️ File Hash:* \`${final_hash}\``
  return Bot.sendMessage(message.chat.id, message.message_id, final_text, buttons)
}
