// Peer-to-peer file transfer using WebRTC
export interface P2PPeer {
  id: string;
  name: string;
  connection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
}

export interface FileTransferProgress {
  filename: string;
  progress: number;
  total: number;
}

export class P2PFileTransfer {
  private peers: Map<string, P2PPeer> = new Map();
  private onPeerConnected?: (peer: P2PPeer) => void;
  private onPeerDisconnected?: (peerId: string) => void;
  private onFileReceived?: (file: File, fromPeer: string) => void;
  private onTransferProgress?: (progress: FileTransferProgress) => void;
  private localPeerId: string;
  private localPeerName: string;

  constructor(
    localPeerName: string,
    callbacks: {
      onPeerConnected?: (peer: P2PPeer) => void;
      onPeerDisconnected?: (peerId: string) => void;
      onFileReceived?: (file: File, fromPeer: string) => void;
      onTransferProgress?: (progress: FileTransferProgress) => void;
    }
  ) {
    this.localPeerId = `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.localPeerName = localPeerName;
    this.onPeerConnected = callbacks.onPeerConnected;
    this.onPeerDisconnected = callbacks.onPeerDisconnected;
    this.onFileReceived = callbacks.onFileReceived;
    this.onTransferProgress = callbacks.onTransferProgress;
  }

  async createOffer(): Promise<string> {
    const peer: P2PPeer = {
      id: this.localPeerId,
      name: this.localPeerName,
      connection: new RTCPeerConnection({
        iceServers: [] // No STUN/TURN servers - local network only
      }),
      dataChannel: null
    };

    const connection = peer.connection!;
    const dataChannel = connection.createDataChannel('fileTransfer', {
      ordered: true
    });

    peer.dataChannel = dataChannel;
    this.setupDataChannel(dataChannel, peer);

    // Store the peer before creating offer
    this.peers.set(peer.id, peer);

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await new Promise<void>((resolve) => {
      if (connection.iceGatheringState === 'complete') {
        resolve();
      } else {
        connection.addEventListener('icegatheringstatechange', () => {
          if (connection.iceGatheringState === 'complete') {
            resolve();
          }
        });
      }
    });

    const offerData = {
      type: 'offer',
      sdp: connection.localDescription,
      peerId: this.localPeerId,
      peerName: this.localPeerName
    };

    return btoa(JSON.stringify(offerData));
  }

  async acceptOffer(offerCode: string): Promise<string> {
    try {
      const offerData = JSON.parse(atob(offerCode));
    
    const peer: P2PPeer = {
      id: offerData.peerId,
      name: offerData.peerName,
      connection: new RTCPeerConnection({
        iceServers: []
      }),
      dataChannel: null
    };

    const connection = peer.connection!;

    connection.ondatachannel = (event) => {
      peer.dataChannel = event.channel;
      this.setupDataChannel(event.channel, peer);
    };

    await connection.setRemoteDescription(offerData.sdp);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    // Wait for ICE gathering
    await new Promise<void>((resolve) => {
      if (connection.iceGatheringState === 'complete') {
        resolve();
      } else {
        connection.addEventListener('icegatheringstatechange', () => {
          if (connection.iceGatheringState === 'complete') {
            resolve();
          }
        });
      }
    });

      this.peers.set(peer.id, peer);

      const answerData = {
        type: 'answer',
        sdp: connection.localDescription,
        peerId: this.localPeerId,
        peerName: this.localPeerName
      };

      console.log('Accepted offer from peer:', peer.name);
      return btoa(JSON.stringify(answerData));
    } catch (error) {
      console.error('Failed to accept offer:', error);
      throw error;
    }
  }

  async completeConnection(answerCode: string) {
    try {
      const answerData = JSON.parse(atob(answerCode));
      
      const peer = this.peers.get(this.localPeerId);
      if (!peer) {
        throw new Error('No pending connection found. Create an offer first.');
      }
      
      if (!peer.connection) {
        throw new Error('Connection not initialized');
      }

      await peer.connection.setRemoteDescription(answerData.sdp);
      
      // Update peer info
      const remotePeerId = answerData.peerId;
      const remotePeerName = answerData.peerName;
      
      peer.id = remotePeerId;
      peer.name = remotePeerName;
      
      this.peers.delete(this.localPeerId);
      this.peers.set(remotePeerId, peer);
      
      console.log('Connection completed with peer:', remotePeerName);
    } catch (error) {
      console.error('Failed to complete connection:', error);
      throw error;
    }
  }

  private setupDataChannel(channel: RTCDataChannel, peer: P2PPeer) {
    let receivedChunks: ArrayBuffer[] = [];
    let fileMetadata: { name: string; size: number; type: string } | null = null;

    channel.onopen = () => {
      console.log('Data channel opened with peer:', peer.name);
      if (this.onPeerConnected) {
        this.onPeerConnected(peer);
      }
    };

    channel.onclose = () => {
      console.log('Data channel closed with peer:', peer.name);
      this.peers.delete(peer.id);
      if (this.onPeerDisconnected) {
        this.onPeerDisconnected(peer.id);
      }
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        // Metadata message
        fileMetadata = JSON.parse(event.data);
        receivedChunks = [];
      } else {
        // File chunk
        receivedChunks.push(event.data);
        
        if (fileMetadata && this.onTransferProgress) {
          const received = receivedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
          this.onTransferProgress({
            filename: fileMetadata.name,
            progress: received,
            total: fileMetadata.size
          });
        }

        // Check if transfer complete
        if (fileMetadata) {
          const totalReceived = receivedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
          if (totalReceived >= fileMetadata.size) {
            const blob = new Blob(receivedChunks, { type: fileMetadata.type });
            const file = new File([blob], fileMetadata.name, { type: fileMetadata.type });
            
            if (this.onFileReceived) {
              this.onFileReceived(file, peer.name);
            }
            
            receivedChunks = [];
            fileMetadata = null;
          }
        }
      }
    };
  }

  async sendFile(peerId: string, file: File) {
    const peer = this.peers.get(peerId);
    if (!peer?.dataChannel || peer.dataChannel.readyState !== 'open') {
      throw new Error('Peer not connected');
    }

    const channel = peer.dataChannel;
    const chunkSize = 16384; // 16KB chunks

    // Send metadata
    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type
    };
    channel.send(JSON.stringify(metadata));

    // Send file in chunks
    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + chunkSize);
      const arrayBuffer = await chunk.arrayBuffer();
      
      // Wait if buffer is full
      while (channel.bufferedAmount > chunkSize * 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      channel.send(arrayBuffer);
      offset += chunkSize;

      if (this.onTransferProgress) {
        this.onTransferProgress({
          filename: file.name,
          progress: Math.min(offset, file.size),
          total: file.size
        });
      }
    }
  }

  getPeers(): P2PPeer[] {
    return Array.from(this.peers.values());
  }

  disconnect() {
    this.peers.forEach(peer => {
      peer.dataChannel?.close();
      peer.connection?.close();
    });
    this.peers.clear();
  }
}
