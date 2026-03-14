import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  NodeOperationError,
} from 'n8n-workflow';

export class WorkflowLogs implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WorkflowLogs',
    name: 'workflowLogs',
    icon: 'file:workflowlogs.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["logType"]}} log',
    description: 'Send workflow logs to WorkflowLogs monitoring platform',
    defaults: {
      name: 'WorkflowLogs',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'workflowLogsApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        options: [
          {
            name: 'Auto-Detect (Error Trigger)',
            value: 'autoDetect',
            description: 'Automatically extract error details from Error Trigger output',
          },
          {
            name: 'Manual',
            value: 'manual',
            description: 'Manually configure all fields',
          },
        ],
        default: 'autoDetect',
        description: 'Auto-Detect mode parses the Error Trigger output automatically',
      },
      {
        displayName: 'Log Type',
        name: 'logType',
        type: 'options',
        options: [
          {
            name: 'Error',
            value: 'ERROR',
            description: 'Log an error event',
          },
          {
            name: 'Success',
            value: 'SUCCESS',
            description: 'Log a success event',
          },
        ],
        default: 'ERROR',
        required: true,
        description: 'The type of log to send',
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            mode: ['manual'],
          },
        },
        description: 'The log message. Supports expressions, e.g. {{$json.error.message}}.',
        typeOptions: {
          rows: 3,
        },
      },
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: [
          {
            displayName: 'Error Code',
            name: 'errorCode',
            type: 'string',
            default: '',
            description: 'Override the auto-detected error code (e.g. TIMEOUT, AUTH_FAILED)',
          },
          {
            displayName: 'Severity',
            name: 'severity',
            type: 'options',
            options: [
              { name: 'Critical', value: 'CRITICAL' },
              { name: 'High', value: 'HIGH' },
              { name: 'Medium', value: 'MEDIUM' },
              { name: 'Low', value: 'LOW' },
              { name: 'Info', value: 'INFO' },
            ],
            default: '',
            description: 'Override the auto-detected severity level. Leave empty for auto-detection.',
          },
          {
            displayName: 'Execution URL',
            name: 'executionUrl',
            type: 'string',
            default: '',
            description: 'URL to the n8n execution for quick access',
          },
          {
            displayName: 'Workflow ID',
            name: 'workflowId',
            type: 'string',
            default: '={{$workflow.id}}',
            description: 'The n8n workflow ID (auto-filled)',
          },
          {
            displayName: 'Workflow Name',
            name: 'workflowName',
            type: 'string',
            default: '={{$workflow.name}}',
            description: 'The n8n workflow name (auto-filled)',
          },
          {
            displayName: 'Execution ID',
            name: 'executionId',
            type: 'string',
            default: '={{$execution.id}}',
            description: 'The n8n execution ID (auto-filled)',
          },
          {
            displayName: 'Node Name',
            name: 'nodeName',
            type: 'string',
            default: '',
            description: 'The name of the node that triggered this log',
          },
          {
            displayName: 'Node Type',
            name: 'nodeType',
            type: 'string',
            default: '',
            description: 'The type of the node that triggered this log',
          },
          {
            displayName: 'Stack Trace',
            name: 'stackTrace',
            type: 'string',
            default: '',
            description: 'Full stack trace for errors',
            typeOptions: {
              rows: 5,
            },
          },
          {
            displayName: 'Include Input Data',
            name: 'includeInputData',
            type: 'boolean',
            default: false,
            description: 'Whether to include the input item data as payload in the log',
          },
          {
            displayName: 'Custom Metadata',
            name: 'metadata',
            type: 'json',
            default: '{}',
            description: 'Custom JSON metadata to attach to the log',
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials('workflowLogsApi');
    const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
    const apiKey = credentials.apiKey as string;

    for (let i = 0; i < items.length; i++) {
      try {
        const mode = this.getNodeParameter('mode', i) as string;
        const logType = this.getNodeParameter('logType', i) as string;
        const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

        const body: IDataObject = {
          type: logType,
        };

        if (mode === 'autoDetect') {
          // Auto-extract from Error Trigger or any input data
          const json = items[i].json as IDataObject;
          body.message = extractMessage(json, logType);
          body.stackTrace = extractStackTrace(json);
          body.nodeName = extractField(json, ['execution.lastNodeExecuted', 'lastNodeExecuted']) as string || undefined;
          body.executionUrl = extractField(json, ['execution.url', 'executionUrl']) as string || undefined;

          // Auto-fill workflow info from expressions
          body.workflowId = additionalFields.workflowId || extractField(json, ['workflow.id', 'workflowId']) as string || undefined;
          body.workflowName = additionalFields.workflowName || extractField(json, ['workflow.name', 'workflowName']) as string || undefined;
          body.executionId = additionalFields.executionId || extractField(json, ['execution.id', 'executionId']) as string || undefined;

          // Always include the full input data in auto-detect mode
          body.payload = json;
        } else {
          // Manual mode
          const message = this.getNodeParameter('message', i) as string;
          body.message = message;

          if (additionalFields.workflowId) body.workflowId = additionalFields.workflowId;
          if (additionalFields.workflowName) body.workflowName = additionalFields.workflowName;
          if (additionalFields.executionId) body.executionId = additionalFields.executionId;
          if (additionalFields.stackTrace) body.stackTrace = additionalFields.stackTrace;
          if (additionalFields.nodeName) body.nodeName = additionalFields.nodeName;
          if (additionalFields.nodeType) body.nodeType = additionalFields.nodeType;

          if (additionalFields.includeInputData) {
            body.payload = items[i].json;
          }
        }

        // Overrides (apply in both modes)
        if (additionalFields.errorCode) body.errorCode = additionalFields.errorCode;
        if (additionalFields.severity) body.severity = additionalFields.severity;
        if (additionalFields.executionUrl) body.executionUrl = additionalFields.executionUrl;

        if (additionalFields.metadata) {
          try {
            body.metadata = typeof additionalFields.metadata === 'string'
              ? JSON.parse(additionalFields.metadata)
              : additionalFields.metadata;
          } catch {
            body.metadata = { raw: additionalFields.metadata };
          }
        }

        const response = await this.helpers.httpRequest({
          method: 'POST',
          url: `${baseUrl}/api/logs/ingest`,
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body,
          json: true,
        });

        const executionData = this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray(response as IDataObject),
          { itemData: { item: i } },
        );
        returnData.push(...executionData);

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: (error as Error).message,
              success: false,
            },
            pairedItem: { item: i },
          });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error as Error, {
          itemIndex: i,
          description: 'Failed to send log to WorkflowLogs. Check your API key and base URL.',
        });
      }
    }

    return [returnData];
  }
}

// ========================================
// Helper functions for auto-detection
// ========================================

/**
 * Extract a value from nested JSON using dot-notation paths
 */
function extractField(json: IDataObject, paths: string[]): unknown {
  for (const path of paths) {
    const parts = path.split('.');
    let current: unknown = json;
    let found = true;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        found = false;
        break;
      }
    }
    if (found && current !== undefined && current !== null && current !== '') {
      return current;
    }
  }
  return null;
}

/**
 * Extract error message from various n8n data structures
 */
function extractMessage(json: IDataObject, logType: string): string {
  if (logType === 'SUCCESS') {
    return 'Workflow executed successfully';
  }

  // Try common error paths from Error Trigger
  const paths = [
    'execution.error.message',
    'error.message',
    'message',
    'execution.error',
    'error',
  ];

  for (const path of paths) {
    const value = extractField(json, [path]);
    if (value && typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }
  }

  return 'Unknown error';
}

/**
 * Extract stack trace from various n8n data structures
 */
function extractStackTrace(json: IDataObject): string | undefined {
  const paths = [
    'execution.error.stack',
    'error.stack',
    'stack',
    'execution.error.stackTrace',
    'stackTrace',
  ];

  for (const path of paths) {
    const value = extractField(json, [path]);
    if (value && typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}
