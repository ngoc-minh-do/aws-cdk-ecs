import * as cdk from 'aws-cdk-lib';
import { aws_ecr, TimeZone } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { EnvironmentFile } from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy, PolicyDocument, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { Vpc } from 'aws-cdk-lib/aws-ec2';

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, vpc: Vpc, props?: cdk.StackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, 'ECSCluster-1', {
      clusterName: 'Ngoc-Cluster-1',
      vpc: vpc,
    });

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef-1', {
      family: 'NgocTaskDefinition-1',
      memoryLimitMiB: 1024,
      cpu: 512,
      taskRole: new Role(this, 'ECSTaskDefTaskRole-1', {
        roleName: 'NgocECSTaskDefTaskRole-1',
        assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromManagedPolicyArn(this, 'my-policy', 'arn:aws:iam::your-custom-iam-policy'),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        ]
      }),
      executionRole: new Role(this, 'ECSTaskDefExecutionRole-1', {
        roleName: 'NgocECSTaskDefExecutionRole-1',
        assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        ]
      })
    });

    const ecrRepository = aws_ecr.Repository.fromRepositoryName(this, 'EcrRepository', 'ngoc-repository');

    const container = fargateTaskDefinition.addContainer('Container', {
      containerName: 'Container',
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ngoc-app-1',
        logRetention: RetentionDays.ONE_YEAR,
      }),
      portMappings: [
        {
          containerPort: 3000,
          hostPort: 3000
        }
      ],
      enableRestartPolicy: true,
      environmentFiles: [
        EnvironmentFile.fromAsset('./your.env'),
      ]
    });

    const fgSecurityGroup = new ec2.SecurityGroup(this, 'FGSecurityGroup-1', {
      securityGroupName: 'NgocFGSecurityGroup-1',
      vpc
    });
    fgSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp());
    const service = new ecs.FargateService(this, 'FargateService-1', {
      cluster,
      taskDefinition: fargateTaskDefinition,
      securityGroups: [
        fgSecurityGroup
      ],
      enableExecuteCommand: true,
      desiredCount: 1,
      circuitBreaker: {
        enable: true,
        rollback: true,
      },
      vpcSubnets: {
        subnets: [vpc.privateSubnets[0]]
      },
    });

    const deadLetterSqs = new Queue(this, 'SQSDeadLetter', {
      queueName: 'NgocSQSDeadLetter',
    });

    const ecsSchedulerRole = new Role(this, 'EcsSchedulerRole', {
      roleName: 'NgocEcsSchedulerRole',
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
      inlinePolicies: {
        'policy': PolicyDocument.fromJson({
          'Version': '2012-10-17',
          'Statement': [
            {
              'Effect': 'Allow',
              'Action': 'iam:PassRole',
              'Resource': [
                fargateTaskDefinition.executionRole?.roleArn,
                fargateTaskDefinition.taskRole?.roleArn,
              ],
            },
            {
              'Effect': 'Allow',
              'Action': 'ecs:RunTask',
              'Resource': [fargateTaskDefinition.taskDefinitionArn],
            },
            {
              'Effect': 'Allow',
              'Action': [
                'sqs:SendMessage'
              ],
              'Resource': [
                deadLetterSqs.queueArn,
              ]
            }
          ]
        })
      },
    });

    const cronBasedSchedule = new CfnSchedule(this, 'Schedule', {
      scheduleExpression: 'cron(0 * ? * * *)',
      scheduleExpressionTimezone: TimeZone.ASIA_TOKYO.timezoneName,
      flexibleTimeWindow: {
        mode: 'OFF',
      },
      state: 'ENABLED',
      target: {
        arn: cluster.clusterArn,
        roleArn: ecsSchedulerRole.roleArn,
        ecsParameters: {
          taskDefinitionArn: fargateTaskDefinition.taskDefinitionArn,
          launchType: 'FARGATE',
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: [vpc.privateSubnets[0].subnetId],
              securityGroups: [
                fgSecurityGroup.securityGroupId,
              ],
            }
          },
          taskCount: 1,
        },
        deadLetterConfig: {
          arn: deadLetterSqs.queueArn,
        },
        input: JSON.stringify({
          containerOverrides: [
            {
              name: container.containerName,
              command: [
                'node',
                '/opt/your-application/cli.js',
                'your-cli-argument'
              ],
            }
          ],
        }, null, 4)
      },
    });
  }
}
