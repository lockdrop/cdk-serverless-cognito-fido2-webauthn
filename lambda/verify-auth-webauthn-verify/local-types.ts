import { AuthenticatorTransport } from '@simplewebauthn/typescript-types';

// These types really should exist in the CDK aws-lambda module (similar to API GW types), but unfortunately they dont.
// These are based off of the documentation here: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html
export interface CognitoVerifyAuthEventRequest {
    userAttributes: {
        [key: string]: string;
    };
    privateChallengeParameters: {
        [key: string]: string;
    };
    challengeAnswer: string;
    userNotFound: boolean;
    clientMetadata: {
        [key: string]: string;
    };
}

export interface CognitoVerifyAuthEventResponse {
    answerCorrect: boolean;
}

export interface CognitoVerifyAuthEvent {
    request: CognitoVerifyAuthEventRequest;
    response: CognitoVerifyAuthEventResponse;
    userPoolId: string;
}

// https://simplewebauthn.dev/docs/packages/server#installing
export type Authenticator = {
    credentialID: Buffer;
    credentialPublicKey: Buffer;
    counter: number;
    // ['usb' | 'ble' | 'nfc' | 'internal']
    transports?: AuthenticatorTransport[];
};