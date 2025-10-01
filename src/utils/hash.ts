export async function hashPrompt(content: string): Promise<string> {
  // Create a deterministic hash from the prompt content
  const encoder = new TextEncoder();
  const data = encoder.encode(content.trim());

  // Use crypto.subtle for consistent hashing
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Return hex representation
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}