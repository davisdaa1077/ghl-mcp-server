import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

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

// ── TOOLS DEFINITION ──────────────────────────────────────────
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
        startTime: { type: 'string', description: 'ISO 8601 start date e.g. 2026-05-01T00:00:00Z' },
        endTime: { type: 'string', description: 'ISO 8601 end date e.g. 2026-05-31T23:59:59Z' },
        calendarId: { type: 'string', description: 'Optional calendar ID' },
      },
      required: ['startTime', 'endTime'],
    },
  },
  {
    name: 'search_opportunities',
    description: 'Search GHL pipeline opportunities by status or stage',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'open, won, lost, abandoned' },
        pipelineId: { type: 'string', description: 'Optional pipeline ID' },
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

// ── TOOL HANDLERS ─────────────────────────────────────────────
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
      const params = {
        locationId: LOCATION_ID,
        startTime: args.startTime,
        endTime: args.endTime,
      };
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
      const res = await GHL.patch(`/opportunities/${args.opportunityId}/status`, {
        status: args.status,
      });
      return res.data;
    }
    case 'list_workflows': {
      const res = await GHL.get('/workflows/', { params: { locationId: LOCATION_ID } });
      return res.data;
    }
    case 'add_contact_to_workflow': {
      const res = await GHL.post(
        `/contacts/${args.contactId}/workflow/${args.workflowId}`,
        { eventStartTime: new Date().toISOString() }
      );
      return res.data;
    }
    case 'list_pipelines': {
      const res = await GHL.get('/opportunities/pipelines', {
        params: { locationId: LOCATION_ID },
      });
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

// ── MCP ENDPOINTS ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const init = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'ghl-mcp-server', version: '1.0.0' },
      capabilities: { tools: {} },
    },
  };
  res.write(`data: ${JSON.stringify(init)}\n\n`);
});

app.post('/messages', async (req, res) => {
  const { id, method, params } = req.body;

  try {
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'ghl-mcp-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
    }

    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools } });
    }

    if (method === 'tools/call') {
      const result = await handleTool(params.name, params.arguments || {});
      return res.json({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      });
    }

    res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (err) {
    res.json({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: err.message },
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GHL MCP Server running on port ${PORT}`));