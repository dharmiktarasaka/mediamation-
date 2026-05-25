import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// Helper to convert local file to generative part (base64)
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString('base64'),
      mimeType
    },
  };
}

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
  const apiKey = process.env.GEMINI_API_KEY;
  const mockCaption = MOCK_CAPTIONS[tone.toLowerCase()] || MOCK_CAPTIONS.attractive;

  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey.trim() === '') {
    return {
      caption: mockCaption,
      isMock: true,
      reason: 'missing_key'
    };
  }

  try {
    const filePath = path.join(process.cwd(), 'uploads', filename);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found on server.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Analyze this image and write a highly engaging, trending social media caption suitable for Instagram and Facebook.
The caption should:
1. Have an attention-grabbing hook.
2. Be written in a ${tone} tone.
3. Include 5-10 relevant and trending hashtags at the end.
4. Keep the caption concise yet compelling.
Return ONLY the final caption text, ready to be copied. Do not add any conversational intro or markdown wrapper like 'Here is a caption'.`;

    const imagePart = fileToGenerativePart(filePath, mimetype);

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    return {
      caption: response.text().trim(),
      isMock: false
    };
  } catch (error) {
    console.error('[AI Caption Live API Error, falling back to mock]:', error.message);
    return {
      caption: mockCaption,
      isMock: true,
      reason: 'api_error',
      error: error.message
    };
  }
}
