import { getGoogleAccessToken } from "@/lib/google-calendar";
import { googleApi } from "@/lib/google";

export async function createMeetSpace(userId: string) {
  const { accessToken } = await getGoogleAccessToken(userId);

  return googleApi<{
    name: string;
    meetingUri?: string;
    meetingSpace?: string;
  }>(accessToken, "https://meet.googleapis.com/v2/spaces", {
    method: "POST",
    body: JSON.stringify({ spaceConfig: {} })
  });
}