# AWS CDK ECS

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Stack introduction
- vpc-stack: Virtual Private Cloud network stack
- ecs-stack: Deploy ECS Fargate container from ECR image, include an example of using EventBridge to trigger container command
- ecs-code-pipeline-stack: Build container image, push to ECR, and then deploy ECS Fargate container

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

Prepare AWS environment for usage with the AWS AWS CDK
```shell
cdk bootstrap
cdk bootstrap --toolkit-stack-name Ngoc-CDKToolkit --qualifier ngoc
```

Deploy
```shell
cdk deploy --require-approval never --all
```

Destroy
```shell
cdk destroy --all -f
```

Docker build and run
```shell
docker build -t test:latest . --platform=linux/amd64
docker run -t -i -p 3000:3000 test
```

Describe ECS task
```shell
aws ecs describe-tasks \
    --cluster <ECS_cluster_name> \
    --tasks <ECS_task_ID>
```

Remote access to ECS container's shell
```shell
aws ecs execute-command --cluster <ECS_cluster_name> \
    --task <ECS_task_ID> \
    --container <ECS_container_Name> \
    --interactive --command "/bin/sh"
```

Port forwarding from ECS container
```shell
aws ssm start-session \
  --target ecs:<ECS_cluster_name>_<ECS_task_ID>_<container_runtime_ID> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"], "localPortNumber":["18080"]}'
```

## Reference
- https://docs.aws.amazon.com/codepipeline/latest/userguide/file-reference.html
- https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file-example.html#appspec-file-example-ecs