import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

dotenv.config();

const app = express();
app.use(express.json());

const GHL = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  },
});

const LOCATION_ID = process.env.GHL_LOCATION_ID;

const tools = [
  {
    name: 'search_contacts',
    description: 'Search GHL contacts by name, email, or phone',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_contact',
    description: 'Get a single GHL contact by ID',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'GHL Contact ID' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'update_contact',
    description: 'Update a GHL contact field',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        fields: { type: 'object', description: 'Fields to update as key/value pairs' },
      },
      required: ['contactId', 'fields'],
    },
  },
  {
    name: 'list_calendars',
    description: 'List all calendars in GHL',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_appointments',
    description: 'Get appointments from GHL calendar by date range',
    inputSchema: {
      type: 'object',
      properties: {
        startTime: { type: 'string', description: 'ISO 8601 start date' },
        endTime: { type: 'string', description: 'ISO 8601 end date' },
        calendarId: { type: 'string', description: 'Optional calendar ID' },
      },
      required: ['startTime', 'endTime'],
    },
  },
  {
    name: 'search_opportunities',
    description: 'Search GHL pipeline opportunities',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'open, won, lost, abandoned' },
        pipelineId: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'update_opportunity_status',
    description: 'Update the status of an opportunity',
    inputSchema: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string' },
        status: { type: 'string', description: 'open, won, lost, abandoned' },
      },
      required: ['opportunityId', 'status'],
    },
  },
  {
    name: 'list_workflows',
    description: 'List all workflows in GHL',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_contact_to_workflow',
    description: 'Add a GHL contact to a workflow',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        workflowId: { type: 'string' },
      },
      required: ['contactId', 'workflowId'],
    },
  },
  {
    name: 'list_pipelines',
    description: 'List all pipelines in GHL',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'send_message',
    description: 'Send an SMS or email to a contact through GHL',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        type: { type: 'string', description: 'SMS or Email' },
        message: { type: 'string' },
      },
      required: ['contactId', 'type', 'message'],
    },
  },
];

async function handleTool(name, args) {
  switch (name) {
    case 'search_contacts': {
      const res = await GHL.get('/contacts/search', {
        params: { locationId: LOCATION_ID, query: args.query, limit: args.limit || 20 },
      });
      return res.data;
    }
    case 'get_contact': {
      const res = await GHL.get(`/contacts/${args.contactId}`);
      return res.data;
    }
    case 'update_contact': {
      const res = await GHL.put(`/contacts/${args.contactId}`, args.fields);
      return res.data;
    }
    case 'list_calendars': {
      const res = await GHL.get('/calendars/', { params: { locationId: LOCATION_ID } });
      return res.data;
    }
    case 'get_appointments': {
      const params = { locationId: LOCATION_ID, startTime: args.startTime, endTime: args.endTime };
      if (args.calendarId) params.calendarId = args.calendarId;
      const res = await GHL.get('/calendars/events', { params });
      return res.data;
    }
    case 'search_opportunities': {
      const params = { location_id: LOCATION_ID, limit: args.limit || 20 };
      if (args.status) params.status = args.status;
      if (args.pipelineId) params.pipeline_id = args.pipelineId;
      const res = await GHL.get('/opportunities/search', { params });
      return res.data;
    }
    case 'update_opportunity_status': {
      const res = await GHL.patch(`/opportunities/${args.opportunityId}/status`, { status: args.status });
      return res.data;
    }
    case 'list_workflows': {
      const res = await GHL.get('/workflows/', { params: { locationId: LOCATION_ID } });
      return res.data;
    }
    case 'add_contact_to_workflow': {
      const res = await GHL.post(`/contacts/${args.contactId}/workflow/${args.workflowId}`, {
        eventStartTime: new Date().toISOString(),
      });
      return res.data;
    }
    case 'list_pipelines': {
      const res = await GHL.get('/opportunities/pipelines', { params: { locationId: LOCATION_ID } });
      return res.data;
    }
    case 'send_message': {
      const res = await GHL.post('/conversations/messages', {
        type: args.type,
        contactId: args.contactId,
        message: args.message,
      });
      return res.data;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  { name: 'ghl-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await handleTool(request.params.name, request.params.arguments || {});
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});

const transports = {};

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  const sessionServer = new Server(
    { name: 'ghl-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  sessionServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  sessionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handleTool(request.params.name, request.params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });
  transports[transport.sessionId] = transport;
  res.on('close', () => delete transports[transport.sessionId]);
  await sessionServer.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: 'No transport found for session' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GHL MCP Server running on port ${PORT}`));