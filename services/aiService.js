const axios = require('axios');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-4-31b-it:free',
  'openai/gpt-oss-120b:free',
];

const PRIMARY_MODEL = MODELS[0];
const FALLBACK_MODEL = MODELS[1];

const SYSTEM_PROMPT = `You are OTAS CRM AI Assistant — a helpful AI for OTAS Tech Solution's CRM system. You help with:
- Client management, insights, and recommendations
- Invoice and financial analysis
- Ticket routing and prioritization suggestions
- Content generation (proposals, follow-up emails, meeting summaries, contract terms)
- Project management and task advice
- Expense analysis and budgeting
- General business and technical consultation

Rules:
- Be concise and actionable
- Use bullet points and structured formatting when helpful
- Reference specific CRM data when provided
- If you don't know something, say so clearly
- Respond in the same language the user uses (English or Myanmar)
- Format responses with clear headers and sections`;

const buildHeaders = () => ({
  'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
  'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://otas-crm.vercel.app',
  'X-OpenRouter-Title': process.env.OPENROUTER_SITE_NAME || 'OTAS CRM',
  'Content-Type': 'application/json',
});

const extractContent = (data) => {
  const choice = data?.choices?.[0];
  if (!choice) return '';
  return choice?.message?.content || choice?.text || '';
};

const tryModels = async (messages, options = {}, modelIndex = 0) => {
  if (modelIndex >= MODELS.length) {
    throw new Error('All AI models are currently unavailable. Please try again later.');
  }

  const model = options.model || MODELS[modelIndex];

  try {
    console.log(`[AI] Trying model: ${model}`);
    const response = await axios.post(OPENROUTER_API_URL, {
      model,
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.7,
    }, {
      headers: buildHeaders(),
      timeout: 90000,
    });

    const content = extractContent(response.data);
    const usage = response.data?.usage || {};

    console.log(`[AI] Model ${model} responded: ${content.length} chars, ${usage.completion_tokens || 0} tokens`);

    if (!content && usage.completion_tokens === 0) {
      console.log(`[AI] Empty response from ${model}, trying next model...`);
      return tryModels(messages, options, modelIndex + 1);
    }

    return {
      content,
      model: response.data?.model || model,
      usage: {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
      },
    };
  } catch (error) {
    const status = error.response?.status;
    if (status === 429) {
      console.log(`[AI] Rate limited on ${model} (429), trying next model...`);
      return tryModels(messages, options, modelIndex + 1);
    }
    if (modelIndex < MODELS.length - 1) {
      console.log(`[AI] Error on ${model}: ${error.message}, trying next model...`);
      return tryModels(messages, options, modelIndex + 1);
    }
    throw error;
  }
};

const chat = async (messages, options = {}) => {
  const systemMessage = { role: 'system', content: SYSTEM_PROMPT };
  const fullMessages = [systemMessage, ...messages];
  const modelIndex = options.model ? MODELS.indexOf(options.model) : 0;
  return tryModels(fullMessages, options, modelIndex >= 0 ? modelIndex : 0);
};

const chatStream = async (messages, res, options = {}) => {
  const systemMessage = { role: 'system', content: SYSTEM_PROMPT };
  const fullMessages = [systemMessage, ...messages];

  let lastError = null;
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    try {
      console.log(`[AI Stream] Trying model: ${model}`);
      const response = await axios.post(OPENROUTER_API_URL, {
        model,
        messages: fullMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
        stream: true,
      }, {
        headers: buildHeaders(),
        timeout: 90000,
        responseType: 'stream',
      });

      let fullContent = '';

      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter((line) => line.trim() !== '');
        for (const line of lines) {
          const trimmed = line.replace(/^data: /, '');
          if (trimmed === '[DONE]') {
            res.write(`data: ${JSON.stringify({ content: '', done: true, fullContent })}\n\n`);
            return;
          }
          try {
            const parsed = JSON.parse(trimmed);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
            }
          } catch {}
        }
      });

      response.data.on('end', () => {
        console.log(`[AI Stream] Model ${model} completed: ${fullContent.length} chars`);
        res.write(`data: ${JSON.stringify({ content: '', done: true, fullContent })}\n\n`);
        res.end();
      });

      response.data.on('error', (err) => {
        console.error(`[AI Stream] Error on ${model}:`, err.message);
        res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
        res.end();
      });

      return;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (status === 429) {
        console.log(`[AI Stream] Rate limited on ${model} (429), trying next...`);
        continue;
      }
      console.log(`[AI Stream] Error on ${model}: ${error.message}, trying next...`);
      continue;
    }
  }

  console.error('[AI Stream] All models failed:', lastError?.message);
  res.write(`data: ${JSON.stringify({ error: 'All AI models are currently unavailable', done: true })}\n\n`);
  res.end();
};

const generateContent = async (type, context = {}) => {
  const prompts = {
    proposal: `Write a professional business proposal for the following client/project. Include:
- Executive Summary
- Scope of Work
- Timeline
- Pricing Structure
- Terms and Conditions
Client Info: ${context.clientName || 'N/A'}
Project Details: ${context.description || 'N/A'}
Additional Notes: ${context.additionalNotes || 'N/A'}`,

    email: `Write a professional follow-up email. Context:
- Purpose: ${context.purpose || 'Follow up on recent meeting'}
- Client: ${context.clientName || 'N/A'}
- Tone: ${context.tone || 'Professional and friendly'}
- Key Points: ${context.keyPoints || 'N/A'}`,

    summary: `Create a concise meeting summary from the following notes/conversation:
${context.meetingNotes || context.description || 'No notes provided'}
Include:
- Key Discussion Points
- Decisions Made
- Action Items (with owners if mentioned)
- Follow-up Date`,

    contract: `Draft contract terms for the following engagement:
Client: ${context.clientName || 'N/A'}
Service: ${context.description || 'N/A'}
Include:
- Scope of Work
- Payment Terms
- Intellectual Property
- Confidentiality
- Termination Clause
- Warranty`,

    general: `Help with the following request:
${context.description || 'No description provided'}
Additional Context: ${context.additionalNotes || 'N/A'}`,
  };

  const prompt = prompts[type] || prompts.general;
  const result = await chat([{ role: 'user', content: prompt }]);
  return {
    content: result.content,
    type,
    model: result.model,
    usage: result.usage,
  };
};

const analyzeClient = async (clientData) => {
  const prompt = `Analyze this client data and provide insights:

Client: ${clientData.companyName || clientData.name}
Industry: ${clientData.industry || 'N/A'}
Status: ${clientData.status || 'N/A'}
Source: ${clientData.sourceChannel || 'N/A'}
Services: ${JSON.stringify(clientData.purchasedServices || [])}
Background: ${clientData.backgroundNote || 'N/A'}
Desired Outcome: ${clientData.desiredOutcome || 'N/A'}
Current Problems: ${clientData.currentProblems || 'N/A'}
Conversation Summary: ${(clientData.conversationLogs || []).map((c) => c.text).join('; ')}

Provide analysis in this format:
SUMMARY: (2-3 sentence overview)
STRENGTHS: (bullet list of positive factors)
RISKS: (bullet list of concerns)
RECOMMENDED NEXT STEPS: (numbered list with priority)
SUGGESTED ACTIONS: (specific actionable items with high/medium/low priority)`;

  const result = await chat([{ role: 'user', content: prompt }]);
  return {
    ...parseInsights(result.content),
    model: result.model,
  };
};

const suggestTicket = async (ticketData, departments = [], users = []) => {
  const prompt = `Analyze this support ticket and suggest the best assignment:

Ticket Title: ${ticketData.title}
Description: ${ticketData.description}
Priority: ${ticketData.priority || 'Medium'}

Available Departments: ${departments.map((d) => d.name).join(', ')}
Available Users: ${users.map((u) => `${u.username} (${u.role}, depts: ${(u.departments || []).map((d) => d.name || d).join(', ')})`).join(', ')}

Suggest:
- Best department to assign (with reasoning)
- Best user to assign (with reasoning)
- Recommended priority (with reasoning)
- Estimated time to resolve
- Any related context`;

  const result = await chat([{ role: 'user', content: prompt }]);
  return {
    ...parseSuggestion(result.content, departments, users),
    model: result.model,
  };
};

const parseInsights = (content) => {
  const sections = { summary: '', strengths: [], risks: [], nextSteps: [], recommendations: [] };

  const lines = content.split('\n');
  let currentSection = 'summary';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (lower.includes('summary')) { currentSection = 'summary'; continue; }
    if (lower.includes('strength')) { currentSection = 'strengths'; continue; }
    if (lower.includes('risk')) { currentSection = 'risks'; continue; }
    if (lower.includes('next step')) { currentSection = 'nextSteps'; continue; }
    if (lower.includes('recommend') || lower.includes('action')) { currentSection = 'recommendations'; continue; }

    if (currentSection === 'summary') {
      sections.summary += (sections.summary ? ' ' : '') + trimmed;
    } else if (currentSection === 'recommendations') {
      const priorityMatch = trimmed.match(/\((high|medium|low)\)/i);
      const priority = priorityMatch ? priorityMatch[1].toLowerCase() : 'medium';
      const clean = trimmed.replace(/^\d+\.\s*/, '').replace(/\(.*?\)/, '').trim();
      if (clean) sections.recommendations.push({ action: clean, priority });
    } else if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
      const clean = trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      if (clean) sections[currentSection].push(clean);
    }
  }

  return sections;
};

const parseSuggestion = (content, departments, users) => {
  const lines = content.split('\n');
  const result = {
    departmentId: null,
    departmentName: '',
    assignedTo: null,
    assignedToName: '',
    priority: 'medium',
    estimatedTime: '',
    reasoning: content,
  };

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.includes('department') && trimmed.includes(':')) {
      const deptName = line.split(':').slice(1).join(':').trim();
      const dept = departments.find((d) => d.name.toLowerCase().includes(deptName.toLowerCase()));
      if (dept) {
        result.departmentId = dept._id;
        result.departmentName = dept.name;
      }
    }
    if ((trimmed.includes('user') || trimmed.includes('assign')) && trimmed.includes(':')) {
      const userName = line.split(':').slice(1).join(':').trim().split(' ')[0];
      const user = users.find((u) => u.username.toLowerCase().includes(userName.toLowerCase()));
      if (user) {
        result.assignedTo = user._id;
        result.assignedToName = user.username;
      }
    }
    if (trimmed.includes('priority') && trimmed.includes(':')) {
      const p = line.split(':').slice(1).join(':').trim().toLowerCase();
      if (['low', 'medium', 'high', 'urgent'].includes(p)) result.priority = p;
    }
    if (trimmed.includes('time') || trimmed.includes('estimat')) {
      result.estimatedTime = line.split(':').slice(1).join(':').trim();
    }
  }

  return result;
};

module.exports = {
  chat,
  chatStream,
  generateContent,
  analyzeClient,
  suggestTicket,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
};
