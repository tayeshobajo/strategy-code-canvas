/**
 * Voice answer transcription.
 *
 * The transcript becomes the person's answer text; the recording itself is
 * kept in private storage and referenced from the verbatim record. We never
 * replace a spoken answer with a paraphrase.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function transcribeAudio(input: {
  base64: string;
  mimeType: string;
}): Promise<{ transcript: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("transcription_unavailable");

  const format = input.mimeType.includes("mp4") || input.mimeType.includes("m4a") ? "m4a" : "webm";

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Transcribe the audio word for word. Keep the speaker's own words, filler and phrasing. Return only the transcript, no commentary.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this." },
            { type: "input_audio", input_audio: { data: input.base64, format } },
          ],
        },
      ],
    }),
  });

  if (res.status === 429) throw new Error("transcription_rate_limited");
  if (!res.ok) throw new Error(`transcription_failed_${res.status}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const transcript = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!transcript) throw new Error("transcription_empty");
  return { transcript };
}
