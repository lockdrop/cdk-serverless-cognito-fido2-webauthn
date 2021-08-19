import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { Context, Callback } from 'aws-lambda';
import { verifyAttestationResponse, verifyAssertionResponse, VerifiedAttestation, VerifiedAssertion } from '@simplewebauthn/server';
import { CognitoVerifyAuthEvent, Authenticator } from './local-types';
import base64url from 'base64url';

var cognito = new CognitoIdentityServiceProvider();

// ORIGIN_DOMAIN_NAME should be populated with the CloudFront domain that was generated
const rpID = process.env.ORIGIN_DOMAIN_NAME || '';

// The URL at which attestations and assertions should occur
const origin = `https://${rpID}`;

export const handler = async (
    event: CognitoVerifyAuthEvent,
    context: Context,
    callback: Callback,
) => {

    // Parse the list of stored authenticators from the Cognito user
    let cognitoAuthenticatorCreds: Authenticator[] = JSON.parse(event.request.userAttributes['custom:authCreds']||'[]');
    let userAuthenticators: Authenticator[] = cognitoAuthenticatorCreds.map(authenticator => ({
        credentialID: Buffer.from(authenticator.credentialID),
        credentialPublicKey: Buffer.from(authenticator.credentialPublicKey),
        counter: authenticator.counter,
        transports: authenticator.transports || [],
    }));

    // Determine whether the challenge answer is an assertion (authentication) or an attestation (registration)
    let challengeAnswer = JSON.parse(event.request.challengeAnswer);
    if (challengeAnswer.response.authenticatorData)
    {
        
        // Using the "rawId" from the authenticator's assertion (challengeAnswer) compare with stored authenticator's credentialIDs to find the correct authenticator for verification
        let authenticator: Authenticator = userAuthenticators.find( ({credentialID}) => (Buffer.compare(credentialID, base64url.toBuffer(challengeAnswer.rawId)) === 0)) || userAuthenticators[0];
        
        let verification: VerifiedAssertion = await verifyAssertionResponse({
            credential: challengeAnswer,
            expectedChallenge: event.request.privateChallengeParameters.assertionChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator,
        });

        // Pass?
        if (verification.verified)
        {
            const { assertionInfo } = verification;

            const { newCounter } = assertionInfo;
            authenticator.counter = newCounter;

            // Update the counter for the stored authenticator
            try {
                await cognito.adminUpdateUserAttributes({
                    UserAttributes: [
                        {
                            Name: 'custom:authCreds',
                            // Merges/replaces the current authenticator with it's updated counter into the stored list of authenticators
                            Value: JSON.stringify(userAuthenticators.map(authenticator => [authenticator].find(updatedAuthenticator => (Buffer.compare(updatedAuthenticator.credentialID, authenticator.credentialID)) === 0) || authenticator)),
                        }
                    ],
                    UserPoolId: event.userPoolId,
                    Username: event.request.userAttributes.email,
                }, function(err, data) {
                    if (err) console.log(err, err.stack); // an error occurred
                    else     console.log(data);           // successful response);
                });
                event.response.answerCorrect = true;

            } catch (error) {
                console.error(error);
                event.response.answerCorrect = false;
                callback(null, event);
            }
        }
        else
        {
            event.response.answerCorrect = false;
            callback(null, event);
        }

    }
    else
    {
        let verification: VerifiedAttestation = await verifyAttestationResponse({
            credential: challengeAnswer,
            expectedChallenge: event.request.privateChallengeParameters.attestationChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        // Can register new authenticator?
        if (verification.verified)
        {
            const { attestationInfo } = verification;
            const newAuthenticator: Authenticator = {
                credentialID: attestationInfo?.credentialID || Buffer.from(''),
                credentialPublicKey: attestationInfo?.credentialPublicKey || Buffer.from(''),
                counter: attestationInfo?.counter || 0,
            };

            // Add the new authenticator to the list of stored authenticators for the Cognito user
            try {
                await cognito.adminUpdateUserAttributes({
                    UserAttributes: [
                        {
                            Name: 'custom:authCreds',
                            Value: JSON.stringify([...cognitoAuthenticatorCreds, ...[newAuthenticator]]),
                        }
                    ],
                    UserPoolId: event.userPoolId,
                    Username: event.request.userAttributes.email,
                }, function(err, data) {
                    if (err) console.log(err, err.stack); // an error occurred
                    else     console.log(data);           // successful response);
                });
                event.response.answerCorrect = true;

            } catch (error) {
                console.error(error);
                event.response.answerCorrect = false;
                callback(null, event);
            }
        }

    }

    
    callback(null, event);

}