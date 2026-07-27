// ===== CLOUDFLARE WORKER VERSION =====
// Deploy this to Cloudflare Workers with Wrangler or Dashboard

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // ===== DISCORD INTERACTIONS HANDLER =====
    if (request.method === 'POST' && path === '/interactions') {
      const signature = request.headers.get('X-Signature-Ed25519');
      const timestamp = request.headers.get('X-Signature-Timestamp');
      
      // Verify webhook signature (implement with your public key)
      // For production: use @discord/verify or manual verification
      const rawBody = await request.text();
      const interaction = JSON.parse(rawBody);
      
      return handleInteraction(interaction, env);
    }
    
    // ===== SLASH COMMAND REGISTRATION =====
    if (request.method === 'POST' && path === '/register') {
      const commands = [
        {
          name: 'start',
          description: 'Show main menu',
          type: 1
        },
        {
          name: 'gen',
          description: 'Generate CCs with optional custom fields',
          type: 1,
          options: [
            {
              name: 'input',
              description: 'BIN or full pattern (e.g., 519535 or 519535|12|2027|rnd)',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'mgen',
          description: 'Mass generate CCs and send as .txt file',
          type: 1,
          options: [
            {
              name: 'bin',
              description: 'BIN (e.g., 519535)',
              type: 3,
              required: true
            },
            {
              name: 'amount',
              description: 'Amount with k/m (e.g., 500k, 1m)',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'bin',
          description: 'Get full info about a BIN (first 6-8 digits)',
          type: 1,
          options: [
            {
              name: 'bin',
              description: 'BIN number (e.g., 519535 or 404000)',
              type: 3,
              required: true
            }
          ]
        }
      ];
      
      // Register globally
      const response = await fetch(
        `https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}/commands`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(commands)
        }
      );
      
      return new Response(await response.text(), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('CC Bot Worker Running', { status: 200 });
  }
};

// ===== INTERACTION HANDLER =====
async function handleInteraction(interaction, env) {
  const type = interaction.type;
  const data = interaction.data;
  const token = interaction.token;
  const appId = interaction.application_id;
  
  // PING (type 1)
  if (type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // APPLICATION_COMMAND (type 2)
  if (type === 2) {
    const command = data.name;
    const options = data.options || [];
    
    // Defer response immediately
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 5 }) // Deferred response
    });
    
    // Process commands
    let result;
    switch (command) {
      case 'start':
        result = await handleStart(interaction);
        break;
      case 'gen':
        const input = options.find(o => o.name === 'input')?.value || '';
        result = await handleGen(input, env);
        break;
      case 'mgen':
        const bin = options.find(o => o.name === 'bin')?.value || '';
        const amount = options.find(o => o.name === 'amount')?.value || '';
        result = await handleMGen(bin, amount, env);
        break;
      case 'bin':
        const binLookup = options.find(o => o.name === 'bin')?.value || '';
        result = await handleBin(binLookup, env);
        break;
      default:
        result = { content: '❌ Unknown command' };
    }
    
    // Edit deferred response
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    });
    
    return new Response(JSON.stringify({ type: 6 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // MESSAGE COMPONENT (type 3)
  if (type === 3) {
    return handleComponent(interaction, env);
  }
  
  return new Response('OK', { status: 200 });
}

// ===== COMMAND HANDLERS =====
async function handleStart(interaction) {
  const embed = {
    title: '💎 Welcome to the Premium CC Gen Bot! ⚡️',
    description: 'I can generate valid CCs with accurate Luhn algorithms and fetch real-time BIN data.\n\nSelect an option below to get started:',
    color: 0x00ccff
  };
  
  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: '💳 Generate CC', custom_id: 'menu_gen' },
          { type: 2, style: 4, label: '🔥 Mass Gen (TXT)', custom_id: 'menu_mgen' },
          { type: 2, style: 2, label: '🔍 BIN Lookup', custom_id: 'menu_bin' },
          { type: 2, style: 2, label: '🛠 Commands & Help', custom_id: 'menu_help' }
        ]
      }
    ]
  };
}

async function handleGen(input, env) {
  const args = input.replace(/[|,]/g, ' ').split(/\s+/);
  let bin_pattern = args[0]?.replace(/[^0-9x]/g, '') || '';
  
  if (bin_pattern.length < 6) {
    return { content: '❌ BIN must be at least 6 digits.', flags: 64 };
  }
  
  let mm = args[1] || 'rnd';
  let yy = args[2] || 'rnd';
  let cvv = args[3] || 'rnd';
  
  if (yy !== 'rnd' && yy.length === 2) yy = '20' + yy;
  if (mm !== 'rnd' && mm.length === 1) mm = '0' + mm;
  
  const cards = generateCards(bin_pattern, mm, yy, cvv, 10);
  const binInfo = await getBinInfo(bin_pattern, env);
  const embed = buildEmbed(bin_pattern, binInfo, cards, mm, yy, cvv, 10);
  
  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: '💳 Generate Again', custom_id: `gen_again|${bin_pattern}|${mm}|${yy}|${cvv}` },
          { type: 2, style: 3, label: '🔥 Mass Gen (5)', custom_id: `mass_gen|${bin_pattern}|${mm}|${yy}|${cvv}` }
        ]
      }
    ]
  };
}

async function handleMGen(bin, amount, env) {
  const bin_pattern = bin.replace(/[^0-9x]/g, '');
  if (bin_pattern.length < 6) {
    return { content: '❌ BIN must be at least 6 digits.', flags: 64 };
  }
  
  let raw = amount.toLowerCase().replace(/,/g, '');
  let multiplier = 1;
  if (raw.includes('k')) { multiplier = 1000; raw = raw.replace('k', ''); }
  else if (raw.includes('m')) { multiplier = 1000000; raw = raw.replace('m', ''); }
  
  let count = parseInt(raw) * multiplier;
  if (isNaN(count) || count < 1) {
    return { content: '❌ Invalid amount format. Use like `500k` or `1m`.', flags: 64 };
  }
  if (count > 10000000) count = 10000000;
  
  const cards = generateCards(bin_pattern, 'rnd', 'rnd', 'rnd', count);
  const binInfo = await getBinInfo(bin_pattern, env);
  
  const fileContent = `# Generated by CC Gen Bot\n# BIN: ${bin_pattern.slice(0,6)}\n# Count: ${count}\n# Date: ${new Date().toISOString()}\n\n${cards}`;
  const b64File = btoa(fileContent);
  
  const embed = {
    title: '🔥 MASS GEN COMPLETE',
    color: 0xff0000,
    fields: [
      { name: '💳 Bin', value: `\`${bin_pattern.slice(0,6)}\``, inline: true },
      { name: '💳 Info', value: `\`${binInfo.scheme} - ${binInfo.brand} - ${binInfo.type}\``, inline: true },
      { name: '🏦 Bank', value: `\`${binInfo.bank}\` ${binInfo.emoji}`, inline: true },
      { name: '💎 Amount', value: `\`${count.toLocaleString()}\` Cards`, inline: false }
    ],
    footer: { text: '⏱ Generated | 👨‍💻 Dev: Sx Coder' }
  };
  
  return {
    embeds: [embed],
    files: [
      {
        filename: `${bin_pattern.slice(0,6)}_${amount}_gen.txt`,
        content_base64: b64File
      }
    ]
  };
}

async function handleBin(bin, env) {
  const bin_clean = bin.replace(/[^0-9]/g, '');
  if (bin_clean.length < 6) {
    return { content: '❌ BIN must be at least 6 digits.', flags: 64 };
  }
  
  const bin_lookup = bin_clean.slice(0, 8);
  const info = await getBinInfo(bin_lookup, env);
  
  const is_valid = bin_clean.length >= 16 && luhnCheck(bin_clean) ? '✅ Valid' : 
                   bin_clean.length >= 16 ? '❌ Invalid' : '⚠️ Too short';
  
  const embed = {
    title: `🔍 BIN LOOKUP – ${bin_lookup}`,
    color: 0x9b59b6,
    fields: [
      { name: '🏦 Bank', value: `\`${info.bank}\``, inline: true },
      { name: '🌍 Country', value: `\`${info.country}\` ${info.emoji}`, inline: true },
      { name: '💳 Scheme', value: `\`${info.scheme}\``, inline: true },
      { name: '💳 Type', value: `\`${info.type}\``, inline: true },
      { name: '💎 Brand', value: `\`${info.brand}\``, inline: true },
      { name: '✅ Luhn Check', value: `\`${is_valid}\``, inline: false }
    ],
    footer: { text: '👨‍💻 Dev: Sx Coder' }
  };
  
  return { embeds: [embed] };
}

// ===== COMPONENT HANDLER =====
async function handleComponent(interaction, env) {
  const customId = interaction.data.custom_id;
  const token = interaction.token;
  const appId = interaction.application_id;
  
  // Parse custom_id
  if (customId.startsWith('menu_')) {
    const menuType = customId.replace('menu_', '');
    let embed, components;
    
    switch (menuType) {
      case 'gen':
        embed = {
          title: '💳 Generate CC Instructions',
          description: 'Send a message like:\n`/gen 404000`\n\nOr be specific:\n`/gen 404000|05|2028|123`',
          color: 0x00ff00
        };
        components = [{ type: 1, components: [{ type: 2, style: 2, label: '🔙 Back to Menu', custom_id: 'back_menu' }] }];
        break;
      case 'mgen':
        embed = {
          title: '🔥 Mass Gen Instructions',
          description: 'Output huge amounts of CCs to a .txt file.\nSend:\n`/mgen 404000 500k`',
          color: 0xff0000
        };
        components = [{ type: 1, components: [{ type: 2, style: 2, label: '🔙 Back to Menu', custom_id: 'back_menu' }] }];
        break;
      case 'bin':
        embed = {
          title: '🔍 BIN Lookup Instructions',
          description: 'Get full info about any BIN.\nSend:\n`/bin 519535`\n\nYou can also check full card validity with Luhn.',
          color: 0x9b59b6
        };
        components = [{ type: 1, components: [{ type: 2, style: 2, label: '🔙 Back to Menu', custom_id: 'back_menu' }] }];
        break;
      case 'help':
        embed = {
          title: '🛠 Bot Commands & Usage',
          description: '**1. Standard Gen:**\n`/gen 519535`\n`/gen 519535|12|2027|rnd`\n\n**2. Mass Gen (TXT File):**\n`/mgen 519535 500k`\n\n**3. BIN Lookup:**\n`/bin 519535`\n\n*Use \'k\' for thousands (e.g., 50k, 500k).*',
          color: 0xffff00
        };
        components = [{ type: 1, components: [{ type: 2, style: 2, label: '🔙 Back to Menu', custom_id: 'back_menu' }] }];
        break;
    }
    
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], components })
    });
    
    return new Response('OK', { status: 200 });
  }
  
  if (customId === 'back_menu') {
    const embed = {
      title: '💎 Welcome to the Premium CC Gen Bot! ⚡️',
      description: 'I can generate valid CCs with accurate Luhn algorithms and fetch real-time BIN data.\n\nSelect an option below to get started:',
      color: 0x00ccff
    };
    const components = [{
      type: 1,
      components: [
        { type: 2, style: 1, label: '💳 Generate CC', custom_id: 'menu_gen' },
        { type: 2, style: 4, label: '🔥 Mass Gen (TXT)', custom_id: 'menu_mgen' },
        { type: 2, style: 2, label: '🔍 BIN Lookup', custom_id: 'menu_bin' },
        { type: 2, style: 2, label: '🛠 Commands & Help', custom_id: 'menu_help' }
      ]
    }];
    
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], components })
    });
    
    return new Response('OK', { status: 200 });
  }
  
  // Generate again buttons
  if (customId.startsWith('gen_again|') || customId.startsWith('mass_gen|')) {
    const parts = customId.split('|');
    const bin_pattern = parts[1];
    const mm = parts[2];
    const yy = parts[3];
    const cvv = parts[4];
    const count = customId.startsWith('mass_gen|') ? 5 : 10;
    
    const cards = generateCards(bin_pattern, mm, yy, cvv, count);
    const binInfo = await getBinInfo(bin_pattern, env);
    const embed = buildEmbed(bin_pattern, binInfo, cards, mm, yy, cvv, count);
    
    const components = [{
      type: 1,
      components: [
        { type: 2, style: 1, label: '💳 Generate Again', custom_id: `gen_again|${bin_pattern}|${mm}|${yy}|${cvv}` },
        { type: 2, style: 3, label: '🔥 Mass Gen (5)', custom_id: `mass_gen|${bin_pattern}|${mm}|${yy}|${cvv}` }
      ]
    }];
    
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], components })
    });
    
    return new Response('OK', { status: 200 });
  }
  
  return new Response('Unknown component', { status: 400 });
}

// ===== CORE FUNCTIONS =====
function luhnCheck(cardNumber) {
  const cleaned = cardNumber.replace(/[^0-9]/g, '');
  if (cleaned.length < 16) return false;
  
  let total = 0;
  let alt = true;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let n = parseInt(cleaned[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n = (n % 10) + 1;
    }
    total += n;
    alt = !alt;
  }
  return total % 10 === 0;
}

function generateCards(binPattern, mm, yy, cvv, count) {
  const targetLen = binPattern.startsWith('37') ? 15 : 16;
  const cleanBase = binPattern.replace(/[^0-9x]/g, '').slice(0, targetLen - 1);
  const nowYY = parseInt(new Date().getFullYear().toString().slice(2));
  
  const results = [];
  for (let i = 0; i < count; i++) {
    let ccStr = '';
    for (let c of cleanBase) {
      if (c.toLowerCase() === 'x') ccStr += Math.floor(Math.random() * 10);
      else ccStr += c;
    }
    while (ccStr.length < targetLen - 1) {
      ccStr += Math.floor(Math.random() * 10);
    }
    
    // Luhn
    let total = 0;
    let alt = true;
    for (let i = ccStr.length - 1; i >= 0; i--) {
      let n = parseInt(ccStr[i]);
      if (alt) {
        n *= 2;
        if (n > 9) n = (n % 10) + 1;
      }
      total += n;
      alt = !alt;
    }
    const checkDigit = (10 - (total % 10)) % 10;
    const ccFull = ccStr + checkDigit;
    
    const genMM = (mm && mm !== 'rnd') ? mm.padStart(2, '0') : String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const genYY = (yy && yy !== 'rnd') ? yy : String(nowYY + Math.floor(Math.random() * 10) + 1);
    const genCVV = (cvv && cvv !== 'rnd') ? cvv : 
                   (binPattern.startsWith('37') ? String(Math.floor(Math.random() * 9000) + 1000) : String(Math.floor(Math.random() * 900) + 100));
    
    results.push(`${ccFull}|${genMM}|${genYY}|${genCVV}`);
  }
  return results.join('\n');
}

async function getBinInfo(binPrefix, env) {
  try {
    const lookupBin = binPrefix.slice(0, 6);
    const response = await fetch(`https://lookup.binlist.net/${lookupBin}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        scheme: data.scheme?.toUpperCase() || 'UNKNOWN',
        brand: data.brand || 'UNKNOWN',
        type: data.type?.toUpperCase() || 'UNKNOWN',
        bank: data.bank?.name || 'UNKNOWN BANK',
        emoji: data.country?.emoji || '🏳️',
        country: data.country?.name || 'Unknown'
      };
    }
  } catch (e) {
    console.error('BIN lookup error:', e);
  }
  
  // Fallback for common BINs
  const fallback = {
    '519535': { scheme: 'MASTERCARD', brand: 'WORLD', type: 'CREDIT', bank: 'Wells Fargo', emoji: '🇺🇸', country: 'United States' },
    '404000': { scheme: 'VISA', brand: 'PLATINUM', type: 'CREDIT', bank: 'Chase', emoji: '🇺🇸', country: 'United States' },
    '411111': { scheme: 'VISA', brand: 'CLASSIC', type: 'CREDIT', bank: 'Test Bank', emoji: '🏳️', country: 'Unknown' },
    '555555': { scheme: 'MASTERCARD', brand: 'STANDARD', type: 'CREDIT', bank: 'Test Bank', emoji: '🏳️', country: 'Unknown' },
    '378282': { scheme: 'AMEX', brand: 'GOLD', type: 'CHARGE', bank: 'American Express', emoji: '🇺🇸', country: 'United States' },
    '601100': { scheme: 'DISCOVER', brand: 'CLASSIC', type: 'CREDIT', bank: 'Discover Bank', emoji: '🇺🇸', country: 'United States' }
  };
  
  for (const [key, info] of Object.entries(fallback)) {
    if (binPrefix.startsWith(key)) return info;
  }
  
  return { scheme: 'UNKNOWN', brand: 'UNKNOWN', type: 'UNKNOWN', bank: 'UNKNOWN BANK', emoji: '🏳️', country: 'Unknown' };
}

function buildEmbed(binPattern, binInfo, cards, mm, yy, cvv, count) {
  const ccPad = binPattern.padEnd(16, 'x').slice(0, 16);
  
  return {
    title: '💎 PREMIUM CC GENERATOR',
    color: 0x00ccff,
    fields: [
      { name: '💳 Bin', value: `\`${binPattern.slice(0, 6)}\``, inline: true },
      { name: '💳 Info', value: `\`${binInfo.scheme} - ${binInfo.brand} - ${binInfo.type}\``, inline: true },
      { name: '🏦 Bank', value: `\`${binInfo.bank}\` ${binInfo.emoji}`, inline: true },
      { name: '🌍 Country', value: `\`${binInfo.country}\``, inline: true },
      { name: '🌍 Format', value: `\`${ccPad}|${mm}|${yy}|${cvv}\``, inline: false },
      { name: '━━━━━━━━━━━━━━━━━━━━━━', value: `\`\`\`\n${cards}\n\`\`\``, inline: false }
    ],
    footer: { text: `⏱ Generated ${count} cards | 👨‍💻 Dev: Sx Coder` }
  };
  }
