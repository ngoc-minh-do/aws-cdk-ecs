import * as cdk from 'aws-cdk-lib';
import { aws_ecr, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { DeploymentControllerType, EnvironmentFile } from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy, PolicyDocument, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import {
  CodeBuildAction,
  CodeCommitSourceAction,
  CodeCommitTrigger,
  CodeDeployEcsDeployAction
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { BuildSpec, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { EcsApplication, EcsDeploymentConfig, EcsDeploymentGroup } from 'aws-cdk-lib/aws-codedeploy';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';

export class EcsCodePipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, vpc: Vpc, props?: cdk.StackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, 'ECSCluster-2', {
      clusterName: 'Ngoc-Cluster-2',
      vpc: vpc,
    });

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef-2', {
      family: 'NgocTaskDefinition-2',
      memoryLimitMiB: 1024,
      cpu: 512,
      taskRole: new Role(this, 'ECSTaskDefTaskRole-2', {
        roleName: 'NgocECSTaskDefTaskRole-2',
        assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromManagedPolicyArn(this, 'my-policy', 'arn:aws:iam::your-custom-iam-policy'),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        ]
      }),
      executionRole: new Role(this, 'ECSTaskDefExecutionRole-2', {
        roleName: 'NgocECSTaskDefExecutionRole-2',
        assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        ]
      })
    });

    const container = fargateTaskDefinition.addContainer('Container', {
      containerName: 'Container',
      image: ecs.ContainerImage.fromRegistry("node"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ngoc-app-2',
        logRetention: RetentionDays.ONE_YEAR,
      }),
      portMappings: [
        {
          containerPort: 3000,
          hostPort: 3000
        }
      ],
      enableRestartPolicy: true,
      command: ["npx", "http-server", ".", "-p 3000"],
      environmentFiles: [
        EnvironmentFile.fromAsset('./your.env'),
      ]
    });

    const fgSecurityGroup = new ec2.SecurityGroup(this, 'FGSecurityGroup-2', {
      securityGroupName: 'NgocFGSecurityGroup-2',
      vpc
    });
    fgSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp());
    const service = new ecs.FargateService(this, 'FargateService-2', {
      cluster,
      taskDefinition: fargateTaskDefinition,
      securityGroups: [
        fgSecurityGroup
      ],
      enableExecuteCommand: true,
      desiredCount: 1,
      vpcSubnets: {
        subnets: [vpc.privateSubnets[0]]
      },
      deploymentController: {
        type: DeploymentControllerType.CODE_DEPLOY,
      },
    });
    const albSecurityGroup = new ec2.SecurityGroup(this, 'SecurityGroupALB', {
      vpc
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    const alb = new ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
      vpc,
      securityGroup: albSecurityGroup,
      internetFacing: false,
    });
    const listenerHTTP = alb.addListener('ListenerHTTP', {
      port: 80,
    });

    const targetGroup1 = new ApplicationTargetGroup(this, 'ApplicationTargetGroup1', {
      vpc: vpc,
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200,302',
      },
    });

    const targetGroup2 = new ApplicationTargetGroup(this, 'ApplicationTargetGroup2', {
      vpc: vpc,
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200,302',
      },
    });

    listenerHTTP.addTargetGroups('DefaultHTTPSResponse', {
      targetGroups: [targetGroup1]
    });

    service.attachToApplicationTargetGroup(targetGroup1);

    const artifactBucket = new Bucket(this, 'ArtifactBucket', {
      bucketName: 'ngoc-artifact-bucket',
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const pipeline = new Pipeline(this, 'CodePipeline', {
      pipelineName: 'Ngoc-code-pipeline',
      artifactBucket,
    });

    const codeCommitRepository = codecommit.Repository.fromRepositoryName(this, 'CodeCommit', 'your-source');

    const sourceOutput = new Artifact('Ngoc-source');
    const sourceAction = new CodeCommitSourceAction({
      actionName: 'Source',
      repository: codeCommitRepository,
      output: sourceOutput,
      branch: 'master',
      trigger: CodeCommitTrigger.EVENTS,
    });
    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    const ecrRepository = new aws_ecr.Repository(this, 'EcrRepository', {
      repositoryName: 'ngoc-repository',
      emptyOnDelete: true,
      removalPolicy: RemovalPolicy.DESTROY
    });
    const codeBuildRole = new Role(this, 'CodeBuildRole', {
      roleName: 'NgocCodeBuildRole',
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildAdminAccess'),
      ],
      inlinePolicies: {
        'policy': PolicyDocument.fromJson({
          'Version': '2012-10-17',
          'Statement': [
            {
              'Effect': 'Allow',
              'Action': [
                'ecr:*',
                'ecs:DescribeTaskDefinition',
              ],
              'Resource': '*',
            }
          ]
        })
      },
    })

    const taskDefinitionName = fargateTaskDefinition.family
    const containerName = container.containerName
    const appSpec: any = {
      version: 0.0,
      Resources: [
        {
          TargetService: {
            Type: 'AWS::ECS::Service',
            Properties: {
              TaskDefinition: '<TASK_DEFINITION>',
              LoadBalancerInfo: {
                ContainerName: containerName,
                containerPort: 3000,
              },
            },
          },
        },
      ],
    }
    const codeBuildProject = new Project(this, 'NgocCodeBuildProject', {
      role: codeBuildRole,
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'npm ci',
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'npm run build',

              'npm prune --production',
              'cp -R node_modules/ dist/node_modules',
              'cp -R bin/ dist/bin',
              'rm -rf $(ls -A | grep -v dist)',
              'echo -e \'FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal\\n\\nRUN dnf upgrade -y\\n\\nRUN dnf install unzip -y\\n\\nRUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"\\nRUN unzip -q awscliv2.zip\\nRUN ./aws/install\\n\\nRUN curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -\\nRUN dnf install nodejs -y\\n\\nCOPY dist/ /opt/your-application/\\n\\nRUN chmod -R 700 /opt/your-application\\n\\nEXPOSE 3000\\n\\nCMD node /opt/your-application/main.js\' > Dockerfile',
              'cat Dockerfile',

              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .',
              'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $IMAGE_REPO_URI:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $IMAGE_REPO_URI:$IMAGE_TAG',
              'echo Writing artifact files...',
              'echo "{\\"ImageURI\\":\\"${IMAGE_REPO_URI}:${IMAGE_TAG}\\"}" | tee imageDetail.json',
              `aws ecs describe-task-definition --task-definition ${taskDefinitionName} | jq '.taskDefinition | del (.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .containerDefinitions[0].command)' | jq --arg image '<IMAGE1_NAME>' '.containerDefinitions[] |= if .name == "${containerName}" then .image = $image else . end' > taskdef.json`,
              `echo '${JSON.stringify(appSpec)}' | tee appspec.json`,
              'cat imageDetail.json',
              'cat taskdef.json',
              'cat appspec.json',
            ],
          },
        },
        artifacts: {
          files: [
            'imageDetail.json',
            'taskdef.json',
            'appspec.json',
          ],
        },
      }),
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
        environmentVariables: {
          AWS_DEFAULT_REGION: { value: Stack.of(this).region },
          AWS_ACCOUNT_ID: { value: Stack.of(this).account },
          IMAGE_REPO_NAME: { value: ecrRepository.repositoryName },
          IMAGE_REPO_URI: { value: ecrRepository.repositoryUri },
          IMAGE_TAG: { value: 'latest' },
        },
      },
    });

    const buildOutput = new Artifact('Ngoc-build');
    const buildAction = new CodeBuildAction({
      actionName: 'Build',
      project: codeBuildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });
    pipeline.addStage({
      stageName: 'Build',
      actions: [buildAction],
    });

    const ecs_application = new EcsApplication(this, 'NgocCodeDeployApplication', {
      applicationName: 'NgocCodeDeployApplication'
    })

    // Create CodeDeploy Group
    const codeDeployGroup = new EcsDeploymentGroup(
      this,
      'NgocCodeDeployGroup',
      {
        service: service,
        application: ecs_application,
        deploymentGroupName: 'Ngoc-codedeploy-group',
        blueGreenDeploymentConfig: {
          blueTargetGroup: targetGroup1,
          greenTargetGroup: targetGroup2,
          listener: listenerHTTP,
        },
        deploymentConfig: EcsDeploymentConfig.ALL_AT_ONCE,
      }
    );

    // Add Deploy Stage to Pipeline
    const deployAction = new CodeDeployEcsDeployAction({
      actionName: 'Deploy',
      deploymentGroup: codeDeployGroup,
      taskDefinitionTemplateInput: buildOutput,
      appSpecTemplateFile: buildOutput.atPath('appspec.json'),
      containerImageInputs: [
        {
          input: buildOutput,
          taskDefinitionPlaceholder: 'IMAGE1_NAME',
        },
      ],
    });
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });
  }
}
