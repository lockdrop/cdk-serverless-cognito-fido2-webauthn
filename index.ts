import { App, Construct, Stack, StackProps, Duration, CfnOutput } from '@aws-cdk/core';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as cloudfront_origins from '@aws-cdk/aws-cloudfront-origins';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3_deploy from '@aws-cdk/aws-s3-deployment';
import * as cognito from '@aws-cdk/aws-cognito';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambda_nodejs from '@aws-cdk/aws-lambda-nodejs';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

export class CdkServerlessSimpleWebAuthn extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Static hosting for front-end, S3+CloudFront
    const webAppBucket = new s3.Bucket(this, 'web-app-bucket');
    const webAppCloudfront = new cloudfront.Distribution(this, 'web-app-cloudfront', {
        defaultBehavior: {
          origin: new cloudfront_origins.S3Origin(webAppBucket),
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: 'index.html',
    });

    // Cognito User Pool that will persist the users and their authenticators
    const userPool = new cognito.UserPool(this, 'webauthn-user-pool', {
      selfSignUpEnabled: true,
      autoVerify: {
        email: true,
      },
      customAttributes: {
        // This user property is limited to 2048 bytes, but should be enough to store an array of atleast two authenticators
        authCreds: new cognito.StringAttribute({
          mutable: true,
        }),
      },
    });
    const userPoolClient = new cognito.UserPoolClient(this, 'webauthn-user-pool-client', {
      userPool,
      authFlows: {
        custom: true,
      },
      writeAttributes: (new cognito.ClientAttributes()).withStandardAttributes({email: true}),
      readAttributes: (new cognito.ClientAttributes()).withStandardAttributes({email: true}),
    });

    // Copy the static assets from the public/ folder into the static hosting
    new s3_deploy.BucketDeployment(this, 'web-app-deployment', {
      sources: [s3_deploy.Source.asset(path.join(__dirname, 'public'))],
      destinationBucket: webAppBucket,
      cacheControl: [
        s3_deploy.CacheControl.mustRevalidate(),
      ],
      metadata: {
        // This is so the the front-end scripts can automatically determine the userPool settings from the response headers of the static assets in-browser
        userpoolid: userPool.userPoolId,
        clientid: userPoolClient.userPoolClientId,
      },
    });

    // Automatically confirm user registrations and don't send email verification emails
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, new lambda.Function(this, 'pre-sign-up', {
      runtime: lambda.Runtime.NODEJS_12_X, // Inline source not allowed for nodejs14.x
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = (event, context, callback) => {
          event.response.autoConfirmUser = true;
          event.response.autoVerifyEmail = event.request.userAttributes.hasOwnProperty("email") ? true : false;
          callback(null, event);
        }
      `),
      memorySize: 1024,
      timeout: Duration.seconds(5),
    }));

    // For co-ordinating authentication between the challenge and verification
    userPool.addTrigger(cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE, new lambda_nodejs.NodejsFunction(this, 'define-auth', {
      entry: path.join(__dirname, 'lambda/define-auth/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 1024,
      timeout: Duration.seconds(5),
    }));

    // For generating attestation and assertion options
    userPool.addTrigger(cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE, new lambda_nodejs.NodejsFunction(this, 'create-auth', {
      entry: path.join(__dirname, 'lambda/create-auth-webauthn-generate/index.ts'),
      handler: 'handler',
      bundling: {
        nodeModules: ['@simplewebauthn/server'],
      },
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 1024,
      timeout: Duration.seconds(5),
      environment: {
        ORIGIN_DOMAIN_NAME: webAppCloudfront.domainName,
      },
    }));

    // For verifying received attestation and assertion responses from user's authenticators
    userPool.addTrigger(cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE, new lambda_nodejs.NodejsFunction(this, 'verify-auth', {
      entry: path.join(__dirname, 'lambda/verify-auth-webauthn-verify/index.ts'),
      handler: 'handler',
      bundling: {
        nodeModules: ['@simplewebauthn/server'],
      },
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 1024,
      timeout: Duration.seconds(5),
      environment: {
        ORIGIN_DOMAIN_NAME: webAppCloudfront.domainName,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'cognito-idp:AdminUpdateUserAttributes',
          ],
          resources: [
            '*', // Circular dependency if we wanted to specify the ARN of the UserPool :(.
          ],
        }),
      ],
    }));

    // URL that the deployed sample web-app can be accessed at
    new CfnOutput(this, 'web-app-cloudfront-output', {
      value: `https://${webAppCloudfront.domainName}/`,
    });
  }
}

const app = new App();

new CdkServerlessSimpleWebAuthn(app, 'simplewebauthn-example-cognito');

app.synth();