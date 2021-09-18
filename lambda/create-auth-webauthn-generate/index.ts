import { Context, Callback } from 'aws-lambda';
import { generateRegistrationOptions, generateAuthenticationOptions } from '@simplewebauthn/server';
import { CognitoCreateAuthEvent, Authenticator } from './local-types';

// Human-readable title for your website
const rpName = 'SimpleWebAuthn Example';

// ORIGIN_DOMAIN_NAME should be populated with the CloudFront domain that was generated
const rpID = process.env.ORIGIN_DOMAIN_NAME || '';

export const handler = async (
    event: CognitoCreateAuthEvent,
    context: Context,
    callback: Callback,
) => {

    event.response.publicChallengeParameters={};
    event.response.privateChallengeParameters={};
    let userAuthenticators: Authenticator[] = [];

    // If the user already has authenticators registered, then let's offer an assertion challenge along with our attestation challenge
    if (event.request.userAttributes['custom:authCreds'])
    {
        // Parse the list of stored authenticators from the Cognito user.
        let cognitoAuthenticatorCreds: Authenticator[] = JSON.parse(event.request.userAttributes['custom:authCreds']);
        userAuthenticators = cognitoAuthenticatorCreds.map(authenticator => ({
            credentialID: Buffer.from(authenticator.credentialID), // JSON.parse does not recursively resolve ArrayBuffers
            credentialPublicKey: Buffer.from(authenticator.credentialPublicKey), // JSON.parse does not recursively resolve ArrayBuffers
            counter: authenticator.counter,
            transports: authenticator.transports || [],
        }));

        const options = generateAuthenticationOptions({
            timeout: 60000,
            // Require users to use a previously-registered authenticator
            allowCredentials: userAuthenticators.map(authenticator => ({
                id: authenticator.credentialID,
                type: 'public-key',
                transports: authenticator.transports ?? ['usb', 'ble', 'nfc', 'internal'],
            })),
            userVerification: 'preferred',
        });

        event.response.publicChallengeParameters = {
            assertionChallenge: JSON.stringify(options),
        };
    
        event.response.privateChallengeParameters = {
            assertionChallenge: options.challenge,
        };
    }

    // Always provide an attestation challenge, as there is no-way using our approach to Cognito CUSTOM_AUTH to differentiate between registration/auth
    const options = generateRegistrationOptions({
        rpName,
        rpID,
        userID: event.request.userAttributes.email,
        userName: event.request.userAttributes.email,
        timeout: 60000,
        attestationType: 'indirect',
        authenticatorSelection: {
            userVerification: 'preferred',
            requireResidentKey: false,
        },
        supportedAlgorithmIDs: [-7, -257],
        excludeCredentials: userAuthenticators.map(authenticator => ({
            id: authenticator.credentialID,
            type: 'public-key',
            transports: ['usb', 'ble', 'nfc', 'internal'],
        })),
    });

    event.response.publicChallengeParameters['attestationChallenge'] = JSON.stringify(options);
    event.response.privateChallengeParameters['attestationChallenge'] =  options.challenge;

    callback(null, event);
}