require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const sharp = require("sharp");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callNanoBanana(
  photoPath,
  clothingItems,
  targetWidth = null,
  targetHeight = null
) {
  try {
    console.log("🔧 Starting Gemini with:", {
      photoPath,
      clothingItems,
      itemCount: clothingItems.length,
    });

    if (!GEMINI_API_KEY) {
      throw new Error("❌ GEMINI_API_KEY missing from .env");
    }

    // Get original image dimensions
    const originalImage = sharp(photoPath);
    const metadata = await originalImage.metadata();
    const finalWidth = targetWidth || metadata.width;
    const finalHeight = targetHeight || metadata.height;

    console.log(`📐 Original image size: ${metadata.width}x${metadata.height}`);
    console.log(`🎯 Target output size: ${finalWidth}x${finalHeight}`);

    // READ USER PHOTO
    const userPhotoBuffer = fs.readFileSync(photoPath);
    const userPhotoBase64 = userPhotoBuffer.toString("base64");

    // READ ALL CLOTHING IMAGES
    const clothingParts = [];
    for (let i = 0; i < clothingItems.length; i++) {
      const clothingFile = clothingItems[i];
      let clothingPath = path.join(
        __dirname,
        "../../frontend/clothing",
        clothingFile
      );

      if (!fs.existsSync(clothingPath)) {
        clothingPath = path.join(__dirname, "../clothing", clothingFile);
      }

      if (!fs.existsSync(clothingPath)) {
        throw new Error(`❌ Clothing file not found: ${clothingFile}`);
      }

      // get clothing size


      const clothingBuffer = fs.readFileSync(clothingPath);
      const clothingBase64 = clothingBuffer.toString("base64");

      clothingParts.push({
        inlineData: {
          mimeType: "image/png",
          data: clothingBase64,
        },
      });

      console.log(`📸 Clothing ${i + 1} loaded: ${clothingFile}`);
    }

    // Enhanced prompt to explicitly request specific dimensions
    const dimensionPrompt = `EXACT OUTPUT DIMENSIONS: The output image MUST be exactly ${finalWidth}x${finalHeight} pixels. DO NOT change the size or aspect ratio.`;

    // Build the parts array with enhanced dimension instructions
    const parts = [
      {
        text:
          clothingItems.length === 1
            ? `${dimensionPrompt} Take the person from the last photo and realistically dress them in the clothing from the first photo. Keep the face, pose, body shape, lighting, and background identical. Only replace the clothing naturally with realistic folds, shadows, and proportions. CRITICAL: The output image dimensions MUST be ${finalWidth}x${finalHeight} pixels - exactly the same as the original photo.`
            : `${dimensionPrompt} Take the person from the last photo and realistically dress them in the TOP from the first photo and BOTTOM from the s  econd photo. Combine both clothing items naturally on the person. Keep the face, pose, body shape, lighting, and background identical. Make the outfit look realistic with proper folds, shadows, and proportions. CRITICAL: The output image dimensions MUST be ${finalWidth}x${finalHeight} pixels - exactly the same as the original photo.`,
      },
      ...clothingParts,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: userPhotoBase64,
        },
      },
    ];

    console.log(
      `📤 Sending request with ${clothingItems.length} clothing item(s)`
    );
    console.log(`📏 Requesting exactly ${finalWidth}x${finalHeight} pixels`);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    console.log(`API Key: ${GEMINI_API_KEY}`)

    const config = {
      
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: parts,
        },
      ],
    });

    console.log("✅ Gemini response received");

    const responseParts = response?.candidates?.[0]?.content?.parts || [];

    for (const part of responseParts) {
      if (part.inlineData) {
        console.log("🎨 Image generated, now ensuring correct dimensions...");

        const imageBuffer = Buffer.from(part.inlineData.data, "base64");

        // Get the generated image dimensions
        const generatedMetadata = await sharp(imageBuffer).metadata();
        console.log(
          `📐 Generated image size: ${generatedMetadata.width}x${generatedMetadata.height}`
        );

        // Resize the generated image to match target dimensions
        let finalBuffer;
        if (
          generatedMetadata.width !== finalWidth ||
          generatedMetadata.height !== finalHeight
        ) {
          console.log(
            `⚠️ Resizing from ${generatedMetadata.width}x${generatedMetadata.height} to ${finalWidth}x${finalHeight}`
          );
          finalBuffer = await sharp(imageBuffer)
            .resize(finalWidth, finalHeight, {
              fit: "cover",
              position: "center",
            })
            .toBuffer();
        } else {
          console.log(`✅ Generated image already matches target dimensions`);
          finalBuffer = imageBuffer;
        }

        const outputPath = path.join(
          __dirname,
          "../uploads/gemini_result_" + Date.now() + ".png"
        );

        fs.writeFileSync(outputPath, finalBuffer);
        console.log(
          `💾 Image saved and verified at ${finalWidth}x${finalHeight}:`,
          outputPath
        );
        return outputPath;
      }
    }

    const textResponse = responseParts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join(" ");

    console.log("📝 Text response:", textResponse);
    throw new Error("Gemini returned no image");
  } catch (error) {
    console.error("❌ Gemini Error:", error.message);
    console.error(error.stack);
    throw error;
  }
}

module.exports = { callNanoBanana };
