import 'dotenv/config';
import { generateAICaption } from './src/utils/ai.js';

async function test() {
  const filename = 'media-1779372793754-135506704.jpeg';
  const mimetype = 'image/jpeg';

  try {
    console.log('Generating caption for:', filename);
    const result = await generateAICaption(filename, mimetype);
    console.log('Result:', result);
  } catch (error) {
    console.error('Execution Failed!');
    console.error(error);
  }
}

test();
