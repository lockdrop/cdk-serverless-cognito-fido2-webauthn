import { AuthenticatorTransport } from '@simplewebauthn/typescript-types';

// These types really should exist in the CDK aws-lambda module (similar to API GW types), but unfortunately they dont.
// These are based off of the documentation here: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html
export interface CognitoCreateAuthEventRequestSession {
    challengeName: string;
    challengeResult: boolean;
    challengeMetadata: string;
}

export interface CognitoCreateAuthEventRequest {
    userAttributes: {
        [key: string]: string;
    };
    challengeName: string;
    session: CognitoCreateAuthEventRequestSession[];
    userNotFound: boolean;
    clientMetadata: {
        [key: string]: string;
    };
}

export interface CognitoCreateAuthEventResponse {
    publicChallengeParameters: {
        [key: string]: string;
    };
    privateChallengeParameters: {
        [key: string]: string;
    };
    challengeMetadata: string;
}

export interface CognitoCreateAuthEvent {
    request: CognitoCreateAuthEventRequest;
    response: CognitoCreateAuthEventResponse;
}

// https://simplewebauthn.dev/docs/packages/server#installing
export type Authenticator = {
    credentialID: Buffer;
    credentialPublicKey: Buffer;
    counter: number;
    // ['usb' | 'ble' | 'nfc' | 'internal']
    transports?: AuthenticatorTransport[];
};