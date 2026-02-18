import "express-session";

declare module "express-session" {
  interface SessionData {
    githubToken?: string;
    githubUser?: {
      login: string;
      name: string | null;
      avatarUrl: string | null;
    };
    oauthState?: string;
  }
}
