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

export async function generateAICaption(filename, mimetype, tone = 'attractive') {
  const groqApiKey = process.env.GROQ_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const mockCaption = MOCK_CAPTIONS[tone.toLowerCase()] || MOCK_CAPTIONS.attractive;

  const prompt = `Analyze this image and write a highly engaging, trending social media caption suitable for Instagram and Facebook.
The caption should:
1. Have an attention-grabbing hook.
2. Be written in a ${tone} tone.
3. Include 5-10 relevant and trending hashtags at the end.
4. Keep the caption concise yet compelling.
Return ONLY the final caption text, ready to be copied. Do not add any conversational intro or markdown wrapper like 'Here is a caption'.`;

  // If neither key is configured
  if (
    (!groqApiKey || groqApiKey.trim() === '' || groqApiKey === 'YOUR_GROQ_API_KEY') &&
    (!geminiApiKey || geminiApiKey === 'YOUR_GEMINI_API_KEY' || geminiApiKey.trim() === '')
  ) {
    return {
      caption: mockCaption,
      isMock: true,
      reason: 'missing_key'
    };
  }

  const filePath = path.join(process.cwd(), 'uploads', filename);
  if (!fs.existsSync(filePath)) {
    return {
      caption: mockCaption,
      isMock: true,
      reason: 'api_error',
      error: 'File not found on server.'
    };
  }

  try {
    const base64Data = Buffer.from(fs.readFileSync(filePath)).toString('base64');

    // 1. Try Groq (Llama 3.2 11B Vision) if key is provided
    if (groqApiKey && groqApiKey.trim() !== '' && groqApiKey !== 'YOUR_GROQ_API_KEY') {
      try {
        console.log('[AI Caption] Generating using Groq Llama-3.2-11b-vision-preview...');
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.2-11b-vision-preview',
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
        console.error('[AI Caption] Groq API execution failed:', groqError.response?.data || groqError.message);
        // Fall back to Gemini if available, otherwise return error details.
        if (!geminiApiKey || geminiApiKey === 'YOUR_GEMINI_API_KEY' || geminiApiKey.trim() === '') {
          throw groqError;
        }
      }
    }

    // 2. Fallback to Gemini if key is provided
    if (geminiApiKey && geminiApiKey.trim() !== '' && geminiApiKey !== 'YOUR_GEMINI_API_KEY') {
      console.log('[AI Caption] Falling back / generating using Gemini-2.5-flash...');
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

    // This shouldn't normally be reached as keys were checked, but return mock just in case
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
