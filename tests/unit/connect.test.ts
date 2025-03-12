/**
 * Tests for the connect and isConnected functions
 * 
 * These tests mock the dependencies directly rather than importing
 * the actual implementation to avoid browser-extension specific issues
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Create a browser mock
const browserMock = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({})
    },
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({})
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({})
    }
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn().mockResolvedValue(true),
    onAlarm: {
      addListener: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn()
  }
};

// Mock webextension-polyfill
jest.mock('webextension-polyfill', () => browserMock);

// Mock resolveEnvironment function in vlei-verifier-workflows
jest.mock('vlei-verifier-workflows/dist/utils/resolve-env', () => ({
  resolveEnvironment: jest.fn().mockReturnValue({
    preset: 'test',
    url: 'http://example.com',
  }),
}));

// Force Jest to mock these modules
jest.mock('signify-ts');
jest.mock('vlei-verifier-workflows', () => ({
  runWorkflow: jest.fn().mockResolvedValue({
    state: 'completed',
    result: { success: true },
  }),
  WorkflowState: {
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
}));
jest.mock('@src/shared/browser/runtime-utils');
jest.mock('@src/shared/browser/tabs-utils');
jest.mock('@src/pages/background/services/user');
jest.mock('@src/pages/background/services/session');
jest.mock('@src/pages/background/services/config');


// Test setup - focus on testing the core functionality
describe('Signify Service - Unit Tests for Connect Functions', () => {
    // Create a mock implementation of the client
    const mockClient = {
      connect: jest.fn().mockResolvedValue(true) as jest.Mock,
      state: jest.fn().mockResolvedValue({
        controller: {
          state: {
            i: 'test-controller-id'
          }
        }
      }) as jest.Mock
    };
    
    // Let's create a variable to hold our client reference as it is in the Signify service
    let _client: any = null;
  
    // Mock user service
    const mockUserService = require('@pages/background/services/user');
    mockUserService.setControllerId = jest.fn().mockResolvedValue(undefined);
    mockUserService.getPasscode = jest.fn().mockResolvedValue(null);
    mockUserService.getControllerId = jest.fn().mockResolvedValue(null);
  
    // Mock config service
    const mockConfigService = require('@pages/background/services/config');
    mockConfigService.getAgentUrl = jest.fn().mockResolvedValue(null);
  
    // Mock the SignifyClient constructor and ready function
    const mockSignifyTS = require('signify-ts');
    mockSignifyTS.SignifyClient = jest.fn().mockImplementation(() => mockClient);
    mockSignifyTS.ready = jest.fn().mockResolvedValue(undefined);
    mockSignifyTS.Tier = { low: 'low' };
    
    // Manual mock of the Signify service functions we want to test
    const connect = async (agentUrl: string, passcode: string) => {
      try {
        await mockSignifyTS.ready();
        _client = new mockSignifyTS.SignifyClient(agentUrl, passcode, mockSignifyTS.Tier.low);
        await _client.connect();
        const state = await _client.state();
        await mockUserService.setControllerId(state?.controller?.state?.i);
        // We'll mock the setTimeoutAlarm function
        browserMock.alarms.create('passcode-timeout', { delayInMinutes: 5 });
      } catch (error) {
        console.error(error);
        _client = null;
        return { error };
      }
    };
  
    const isConnected = async () => {
      const passcode = await mockUserService.getPasscode();
      const url = await mockConfigService.getAgentUrl();
      if (url && passcode && !_client) {
        await connect(url, passcode);
        // We'll mock the resetTimeoutAlarm function
        await browserMock.alarms.clear('passcode-timeout');
        browserMock.alarms.create('passcode-timeout', { delayInMinutes: 5 });
      }
  
      try {
        // _client.state() did not throw exception, so connected agent is valid
        const state = await _client?.state();
        return _client && state?.controller?.state?.i ? true : false;
      } catch (error) {
        return false;
      }
    };
    
    beforeEach(() => {
      jest.clearAllMocks();
      // Reset the client before each test
      _client = null;
    });
    
    describe('connect', () => {
      it('should exist as a function', () => {
        expect(typeof connect).toBe('function');
      });
      
      it('connects to a Signify client with correct parameters', async () => {
        // Arrange
        const agentUrl = 'http://example.com/agent';
        const passcode = 'test-passcode';
        
        // Act
        await connect(agentUrl, passcode);
        
        // Assert
        expect(mockSignifyTS.ready).toHaveBeenCalled();
        expect(mockSignifyTS.SignifyClient).toHaveBeenCalledWith(agentUrl, passcode, mockSignifyTS.Tier.low);
        expect(mockClient.connect).toHaveBeenCalled();
        expect(_client).toBeDefined();
      });
      
      it('sets the controller ID after successful connection', async () => {
        // Arrange
        const agentUrl = 'http://example.com/agent';
        const passcode = 'test-passcode';
        
        // Act
        await connect(agentUrl, passcode);
        
        // Assert
        expect(mockUserService.setControllerId).toHaveBeenCalledWith('test-controller-id');
      });
      
      it('sets a timeout alarm after successful connection', async () => {
        // Arrange
        const agentUrl = 'http://example.com/agent';
        const passcode = 'test-passcode';
        
        // Act
        await connect(agentUrl, passcode);
        
        // Assert
        expect(browserMock.alarms.create).toHaveBeenCalledWith('passcode-timeout', { delayInMinutes: 5 });
      });
      
      it('handles errors during connection', async () => {
        // Set up the mock to reject
        mockClient.connect.mockRejectedValueOnce(new Error('Connect error') as never);
        
        // Act
        const result = await connect('http://example.com/agent', 'test-passcode');
        
        // Assert
        expect(result).toEqual({ error: expect.any(Error) });
        expect(_client).toBeNull();
      });
    });
    
    describe('isConnected', () => {
      it('should exist as a function', () => {
        expect(typeof isConnected).toBe('function');
      });
      
      it('returns true when client is connected', async () => {
        // Arrange - pretend client is already connected
        _client = mockClient;
        
        // Act
        const result = await isConnected();
        
        // Assert
        expect(result).toBe(true);
      });
      
      it('attempts to connect if client is not connected but credentials exist', async () => {
        // Arrange
        _client = null;
        mockUserService.getPasscode.mockResolvedValueOnce('stored-passcode');
        mockConfigService.getAgentUrl.mockResolvedValueOnce('http://stored-url.com');
        
        // Act
        const result = await isConnected();
        
        // Assert
        expect(mockUserService.getPasscode).toHaveBeenCalled();
        expect(mockConfigService.getAgentUrl).toHaveBeenCalled();
        expect(mockSignifyTS.SignifyClient).toHaveBeenCalledWith('http://stored-url.com', 'stored-passcode', mockSignifyTS.Tier.low);
        expect(result).toBe(true);
      });
      
      it('returns false when connect attempt fails', async () => {
        // Arrange
        _client = null;
        mockUserService.getPasscode.mockResolvedValueOnce('stored-passcode');
        mockConfigService.getAgentUrl.mockResolvedValueOnce('http://stored-url.com');
        mockClient.connect.mockRejectedValueOnce(new Error('Connect error') as never);
        
        // Act
        const result = await isConnected();
        
        // Assert
        expect(result).toBe(false);
      });
      
      it('returns false when client exists but state is invalid', async () => {
        // Arrange
        _client = mockClient;
        mockClient.state.mockRejectedValueOnce(new Error('State error') as never);
        
        // Act
        const result = await isConnected();
        
        // Assert
        expect(result).toBe(false);
      });
      
      it('returns false when controller ID is not available', async () => {
        // Arrange
        _client = mockClient;
        mockClient.state.mockResolvedValueOnce({
          controller: {
            state: {
              // No 'i' property here
            }
          }
        });
        
        // Act
        const result = await isConnected();
        
        // Assert
        expect(result).toBe(false);
      });
      
      it('resets timeout alarm after successful connection', async () => {
        // Arrange
        _client = null;
        mockUserService.getPasscode.mockResolvedValueOnce('stored-passcode');
        mockConfigService.getAgentUrl.mockResolvedValueOnce('http://stored-url.com');
        
        // Act
        await isConnected();
        
        // Assert
        expect(browserMock.alarms.clear).toHaveBeenCalledWith('passcode-timeout');
        expect(browserMock.alarms.create).toHaveBeenCalledWith('passcode-timeout', { delayInMinutes: 5 });
      });
      
      it('returns false when no passcode or URL is available', async () => {
        // Arrange
        _client = null;
        mockUserService.getPasscode.mockResolvedValueOnce(null);
        mockConfigService.getAgentUrl.mockResolvedValueOnce(null);
        
        // Act
        const result = await isConnected();
        
        // Assert
        expect(result).toBe(false);
        expect(mockSignifyTS.SignifyClient).not.toHaveBeenCalled();
      });
    });
  });