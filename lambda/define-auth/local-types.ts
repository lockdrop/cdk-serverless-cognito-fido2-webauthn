// These types really should exist in the CDK aws-lambda module (similar to API GW types), but unfortunately they dont.
// These are based off of the documentation here: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html
export interface CognitoDefineAuthEventRequestSession {
    challengeName: string;
    challengeResult: boolean;
    challengeMetadata: string;
}

export interface CognitoDefineAuthEventRequest {
    userAttributes: {
        [key: string]: string;
    },
    session: CognitoDefineAuthEventRequestSession[];
    userNotFound: boolean;
    clientMetadata: {
        [key: string]: string;
    },
}

export interface CognitoDefineAuthEventResponse {
    challengeName: string;
    issueTokens: boolean;
    failAuthentication: boolean; 
}

export interface CognitoDefineAuthEvent {
    request: CognitoDefineAuthEventRequest;
    response: CognitoDefineAuthEventResponse;
}