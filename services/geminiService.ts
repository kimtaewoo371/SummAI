import { AnalysisResult } from "../types";

export const analyzeText = async (client: any, text: string): Promise<AnalysisResult> => {
  if (!client) {
    throw new Error('Supabase client not available');
  }

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout - please try again')), 25000)
  );

  try {
    const responsePromise = client.functions.invoke("rapid-function", {
      body: { text, timestamp: Date.now() },
    });

    const { data, error } = await Promise.race([
      responsePromise,
      timeoutPromise,
    ]) as Awaited<typeof responsePromise>;

    if (error) {
      if (error.context?.status === 429) {
        throw new Error("ANONYMOUS_LIMIT_EXCEEDED");
      }
      throw new Error(error.message || "AI 분석 실패");
    }

    if (!data) {
      throw new Error("There is no received data");
    }

    if (!data.executive_summary || !Array.isArray(data.action_items) || !data.suggested_reply) {
      throw new Error("AI returned incomplete data");
    }

    return {
      executive_summary: data.executive_summary,
      action_items:      data.action_items,
      suggested_reply:   data.suggested_reply,
      resultText:        data.resultText,
      outputLength:      data.outputLength,
    };

  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Unknown error occurred");
  }
};