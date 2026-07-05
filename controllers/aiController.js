const aiService = require('../services/aiService');
const Client = require('../models/Client');
const Ticket = require('../models/Ticket');
const Department = require('../models/Department');
const User = require('../models/User');

const sendResponse = require('../utils/response');

const chat = async (req, res) => {
  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    const userContext = `\n\n[CRM Context]\nUser: ${req.user?.username || 'Unknown'}\nRole: ${req.user?.role || 'User'}`;

    const enrichedMessages = messages.map((msg, i) => {
      if (i === messages.length - 1 && msg.role === 'user') {
        return { ...msg, content: msg.content + userContext };
      }
      return msg;
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await aiService.chatStream(enrichedMessages, res, { model });
  } catch (error) {
    console.error('AI Chat error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'AI service unavailable' });
    }
  }
};

const chatSync = async (req, res) => {
  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    const userContext = `\n\n[CRM Context]\nUser: ${req.user?.username || 'Unknown'}\nRole: ${req.user?.role || 'User'}`;

    const enrichedMessages = messages.map((msg, i) => {
      if (i === messages.length - 1 && msg.role === 'user') {
        return { ...msg, content: msg.content + userContext };
      }
      return msg;
    });

    const result = await aiService.chat(enrichedMessages, { model });
    return sendResponse(res, 200, true, 'AI response generated', result);
  } catch (error) {
    console.error('AI Chat error:', error.message);
    return sendResponse(res, 500, false, 'AI service unavailable');
  }
};

const generateContent = async (req, res) => {
  try {
    const { type, clientId, context } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, message: 'Type is required (proposal, email, summary, contract)' });
    }

    let enrichedContext = context || {};

    if (clientId) {
      const client = await Client.findById(clientId);
      if (client) {
        enrichedContext = {
          ...enrichedContext,
          clientName: client.companyName || client.name,
          description: enrichedContext.description || client.backgroundNote,
          purpose: enrichedContext.purpose || `Service engagement with ${client.companyName}`,
        };
      }
    }

    const result = await aiService.generateContent(type, enrichedContext);
    return sendResponse(res, 200, true, 'Content generated', result);
  } catch (error) {
    console.error('AI Generate error:', error.message);
    return sendResponse(res, 500, false, 'Content generation failed');
  }
};

const analyzeClient = async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ success: false, message: 'Client ID is required' });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const result = await aiService.analyzeClient(client);
    return sendResponse(res, 200, true, 'Client analyzed', result);
  } catch (error) {
    console.error('AI Analyze error:', error.message);
    return sendResponse(res, 500, false, 'Client analysis failed');
  }
};

const suggestTicket = async (req, res) => {
  try {
    const { title, description, priority } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    const departments = await Department.find();
    const users = await User.find().select('username role departments');

    const result = await aiService.suggestTicket({ title, description, priority }, departments, users);
    return sendResponse(res, 200, true, 'Ticket suggestion generated', result);
  } catch (error) {
    console.error('AI Suggest error:', error.message);
    return sendResponse(res, 500, false, 'Ticket suggestion failed');
  }
};

const getModels = async (req, res) => {
  try {
    return sendResponse(res, 200, true, 'Models retrieved', {
      primary: aiService.PRIMARY_MODEL,
      fallback: aiService.FALLBACK_MODEL,
      available: [
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta Llama 3.3 70B', contextLength: 131072, isFree: true },
        { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA Nemotron 3 Ultra', contextLength: 1000000, isFree: true },
        { id: 'openai/gpt-oss-120b:free', name: 'OpenAI GPT-OSS 120B', contextLength: 131072, isFree: true },
        { id: 'google/gemma-4-31b-it:free', name: 'Google Gemma 4 31B', contextLength: 262144, isFree: true },
      ],
    });
  } catch (error) {
    return sendResponse(res, 500, false, 'Failed to retrieve models');
  }
};

module.exports = { chat, chatSync, generateContent, analyzeClient, suggestTicket, getModels };
