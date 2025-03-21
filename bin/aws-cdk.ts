#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsStack } from '../lib/ecs-stack';
import { VpcStack } from '../lib/vpc-stack';
import { EcsCodePipelineStack } from '../lib/ecs-code-pipeline-stack';

const app = new cdk.App();
const vpcStack = new VpcStack(app, 'VpcStack', {
  stackName: 'NgocVpcStack',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// new EcsStack(app, 'EcsStack', vpcStack.vpc, {
//   stackName: 'NgocEcsStack',
//   env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
// });

new EcsCodePipelineStack(app, 'EcsCodePipelineStack', vpcStack.vpc, {
  stackName: 'NgocEcsCodePipelineStack',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});