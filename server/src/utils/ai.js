import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MOCK_CAPTIONS = {
  professional: `📈 Empowering teams and building future-proof solutions. Success starts with a clear vision and consistent execution. 💼✨\n\n#business #leadership #career #growth #motivation #success #entrepreneurship #professional`,
  attractive: `✨ Radiating confidence and positive energy. When you feel good, the world aligns. Let your light shine. 💖🌟\n\n#aesthetic #picoftheday #beauty #lookoftheday #fashion #trending #vibes #glam`,
  funny: `😂 I’m not lazy, I’m just in energy-saving mode. Running on coffee and sarcasm today! ☕️🤪\n\n#funny #humor #relatable #meme #dailyhumor #justforlaughs #lmao #funnymoments`,
  personal: `💬 Reflecting on today and feeling incredibly grateful. Life is a journey of small steps, learning, and creating memories. Thank you to everyone on this path with me. ❤️🏡\n\n#grateful #personalstory #reflection #lifejourney #family #friends #throwback #storytime`,
  joy: `☀️ Life is beautiful! Smiling through every moment, spreading positivity, and choosing happiness today and always! 🌈🎉\n\n#happiness #joyful #positivevibes #goodday #blessed #smile #inspiration #livelaughlove`,
  advertisement: `📢 BIG NEWS! Our exclusive deal is now LIVE. Don't miss out on the perfect upgrade you've been waiting for. Click the link in bio to shop now! 🛍️🔥\n\n#shopnow #limitedtime #specialoffer #sale #deals #ad #exclusive #dontmissout`,
  marketing: `🎯 Want to scale your brand? Here are 3 simple tips to get started today: define your audience, write compelling hooks, and test consistently. Save this post for later! 📈💡\n\n#marketingtips #growthhacking #branding #digitalmarketing #socialmediamarketing #businesstips #strategy`
};
export async function generateAICaption(filename, mimetype, tone = 'attractive', user = null, url = null) {
  const mockCaption = MOCK_CAPTIONS[tone.toLowerCase()] || MOCK_CAPTIONS.attractive;

  // Determine api keys (defaults from .env, overridden by user settings if present)
  let groqApiKey = process.env.GROQ_API_KEY;
  let geminiApiKey = process.env.GEMINI_API_KEY;

  if (user) {
    if (user.groqApiKey && user.groqApiKey.trim() !== '') {
      groqApiKey = user.groqApiKey;
    }
    if (user.geminiApiKey && user.geminiApiKey.trim() !== '') {
      geminiApiKey = user.geminiApiKey;
    }
  }

  // Determine provider:
  // If user selected a provider explicitly, use it.
  // Otherwise, default to groq if GROQ_API_KEY is set, then gemini, then mock.
  let provider = 'mock';
  if (user && user.aiProvider && user.aiProvider !== 'mock') {
    provider = user.aiProvider;
  } else {
    // System fallback
    if (groqApiKey && groqApiKey !== 'YOUR_GROQ_API_KEY' && groqApiKey.trim() !== '') {
      provider = 'groq';
    } else if (geminiApiKey && geminiApiKey !== 'YOUR_GEMINI_API_KEY' && geminiApiKey.trim() !== '') {
      provider = 'gemini';
    }
  }

  const prompt = `Analyze this image and write a highly engaging, trending social media caption suitable for Instagram and Facebook.
The caption should:
1. Have an attention-grabbing hook.
2. Be written in a ${tone} tone.
3. Include 5-10 relevant and trending hashtags at the end.
4. Keep the caption concise yet compelling.
Return ONLY the final caption text, ready to be copied. Do not add any conversational intro or markdown wrapper like 'Here is a caption'.`;

  // If mock provider is chosen or no keys are configured
  if (provider === 'mock') {
    return {
      caption: mockCaption,
      isMock: true,
      reason: 'missing_key'
    };
  }

  let base64Data;
  try {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      console.log(`[AI Caption] Fetching remote image for AI analysis: ${url}`);
      const imageRes = await axios.get(url, { responseType: 'arraybuffer' });
      base64Data = Buffer.from(imageRes.data).toString('base64');
    } else {
      const filePath = path.join(process.cwd(), 'uploads', filename);
      if (!fs.existsSync(filePath)) {
        return {
          caption: mockCaption,
          isMock: true,
          reason: 'api_error',
          error: 'File not found on server.'
        };
      }
      base64Data = Buffer.from(fs.readFileSync(filePath)).toString('base64');
    }
  } catch (readError) {
    console.error('[AI Caption] Error reading file data:', readError.message);
    return {
      caption: mockCaption,
      isMock: true,
      reason: 'api_error',
      error: `Failed to load image for AI analysis: ${readError.message}`
    };
  }
    // 1. Try Groq (Llama-4 Scout Vision)
    if (provider === 'groq') {
      try {
        console.log('[AI Caption] Generating using Groq Llama-4-scout-17b-16e-instruct...');
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimetype};base64,${base64Data}`
                    }
                  }
                ]
              }
            ],
            temperature: 0.7,
            max_tokens: 512
          },
          {
            headers: {
              'Authorization': `Bearer ${groqApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const captionText = response.data?.choices?.[0]?.message?.content;
        if (captionText) {
          console.log('[AI Caption] Groq generated successfully!');
          return {
            caption: captionText.trim(),
            isMock: false
          };
        }
      } catch (groqError) {
        const groqErrMsg = groqError.response?.data?.error?.message || groqError.message;
        console.error('[AI Caption] Groq API execution failed:', groqErrMsg);
        throw new Error(`Groq API Error: ${groqErrMsg}`);
      }
    }

    // 2. Try Gemini (Gemini 2.5 Flash)
    if (provider === 'gemini') {
      console.log('[AI Caption] Generating using Gemini-2.5-flash...');
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimetype
        }
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      return {
        caption: response.text().trim(),
        isMock: false
      };
    }

    return {
      caption: mockCaption,
      isMock: true,
      reason: 'missing_key'
    };

  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error('[AI Caption] Live API Error, falling back to mock:', errorMsg);
    return {
      caption: mockCaption,
      isMock: true,
      reason: 'api_error',
      error: errorMsg
    };
  }
}
