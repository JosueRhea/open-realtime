export interface PusherCredentials {
  appId: string;
  key: string;
  secret: string;
  cluster?: string;
}

export interface RestAuthRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: string;
}

export interface PusherAuthenticator {
  credentials: PusherCredentials;
  signChannel(params: {
    socketId: string;
    channel: string;
    channelData?: string;
  }): string;
  signUser(params: {
    socketId: string;
    userData: string;
  }): string;
  validateChannelAuth(params: {
    auth: string;
    socketId: string;
    channel: string;
    channelData?: string;
  }): boolean;
  validateUserAuth(params: {
    auth: string;
    socketId: string;
    userData: string;
  }): boolean;
  validateRestRequest(request: RestAuthRequest): boolean;
}

export type PusherAuthenticatorFactory = (credentials: PusherCredentials) => PusherAuthenticator;
