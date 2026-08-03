"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { uploadFile } from "@/lib/upload";
import { Button, Typography, Box, CircularProgress, Card, Alert } from "@mui/material";

export default function CandidateVivaPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [viva, setViva] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchViva = async () => {
    setIsLoading(true);
    try {
      const data = await withAuthRetry(() => trpc.viva.getMyViva.query({ submissionId: id }));
      setViva(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchViva();
  }, [id]);

  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const enableCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      setStream(s);
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    } catch (err) {
      console.error("Camera access denied", err);
      alert("Camera and microphone access is required for Viva.");
    }
  };

  const handleStartRecording = () => {
    if (!stream) return;
    setRecordedChunks([]);
    setVideoBlob(null);
    const options = { mimeType: 'video/webm' };
    const recorder = new MediaRecorder(stream, options);
    
    recorder.ondataavailable = (e: any) => {
      if (e.data.size > 0) {
        setRecordedChunks(prev => [...prev, e.data]);
      }
    };
    
    recorder.onstop = () => {
      // Create blob when stopped
      // Wait, onstop is synchronous but state update isn't. We'll handle blob in useEffect or direct ref
    };
    
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Give a tiny timeout for chunks to arrive
      setTimeout(() => {
        setRecordedChunks(prev => {
          const blob = new Blob(prev, { type: "video/webm" });
          setVideoBlob(blob);
          if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.src = URL.createObjectURL(blob);
          }
          return prev;
        });
      }, 100);
    }
  };

  const handleReRecord = async () => {
    setVideoBlob(null);
    setRecordedChunks([]);
    if (videoRef.current && stream) {
      videoRef.current.src = "";
      videoRef.current.srcObject = stream;
    }
  };

  const handleSubmitAnswer = async () => {
    if (!videoBlob || !viva) return;
    setUploading(true);
    try {
      const file = new File([videoBlob], `answer-${currentQuestionIdx}.webm`, { type: "video/webm" });
      const { url } = await uploadFile("viva_recording", file);
      
      await withAuthRetry(() => trpc.viva.submitAnswer.mutate({
        vivaId: viva.id,
        questionIndex: currentQuestionIdx,
        videoUrl: url,
        videoSeconds: Math.round(videoBlob.size / 100000), // rough estimate, or use a timer
      }));
      
      await fetchViva();
      
      if (currentQuestionIdx < viva.totalQuestions - 1) {
        setCurrentQuestionIdx(prev => prev + 1);
        handleReRecord();
      }
    } catch (err) {
      alert("Failed to submit answer.");
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    if (!viva) return;
    await withAuthRetry(() => trpc.viva.completeViva.mutate({ vivaId: viva.id }));
    await fetchViva();
  };

  if (isLoading) return <CircularProgress />;
  if (!viva) return <Alert severity="error">Viva not found</Alert>;

  if (viva.status === "generating_questions") {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress size={40} />
        <Typography variant="h5" sx={{ mt: 2 }}>We're preparing your viva questions...</Typography>
        <Typography variant="body2" color="text.secondary">This usually takes 1-2 minutes.</Typography>
        <Button onClick={fetchViva} sx={{ mt: 2 }} variant="outlined">Refresh Status</Button>
      </Box>
    );
  }

  if (viva.status === "questions_ready") {
    return (
      <Box sx={{ p: 4, maxWidth: 600, mx: "auto" }}>
        <Typography variant="h4" sx={{ mb: 2 }}>AI Viva: {viva.missionTitle}</Typography>
        <Typography sx={{ mb: 4 }}>
          You will be asked {viva.totalQuestions} questions about your code. 
          You must record a video answer for each.
        </Typography>
        <Card variant="outlined" sx={{ p: 3, mb: 4 }}>
          <Typography variant="h5" sx={{ mb: 1 }}>Rules</Typography>
          <Typography>• Max 5 minutes per answer</Typography>
          <Typography>• Webcam and microphone required</Typography>
          <Typography>• You have 48 hours to complete this once you start</Typography>
        </Card>
        <Button 
          size="large" 
          variant="contained"
          fullWidth 
          onClick={async () => {
            await withAuthRetry(() => trpc.viva.startRecording.mutate({ vivaId: viva.id }));
            await fetchViva();
            await enableCamera();
          }}
        >
          Start Viva
        </Button>
      </Box>
    );
  }

  if (viva.status === "recording") {
    const question = viva.questions?.[currentQuestionIdx];

    return (
      <Box sx={{ p: 4, maxWidth: 800, mx: "auto" }}>
        <Typography variant="h4" sx={{ mb: 2 }}>Question {currentQuestionIdx + 1} of {viva.totalQuestions}</Typography>
        
        <Card variant="outlined" sx={{ p: 3, mb: 4, bgcolor: "grey.100" }}>
          <Typography variant="h6">{question?.prompt}</Typography>
        </Card>

        <Box sx={{ position: "relative", width: "100%", aspectRatio: "16/9", bgcolor: "black", borderRadius: 2, overflow: "hidden", mb: 3 }}>
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {isRecording && (
            <Box sx={{ position: "absolute", top: 16, right: 16, bgcolor: "error.main", color: "white", px: 2, py: 0.5, borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>REC</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
          {!videoBlob ? (
            isRecording ? (
              <Button variant="contained" color="error" size="large" onClick={handleStopRecording}>
                Stop Recording
              </Button>
            ) : (
              <Button variant="contained" color="primary" size="large" onClick={handleStartRecording}>
                Start Recording
              </Button>
            )
          ) : (
            <>
              <Button variant="outlined" size="large" onClick={handleReRecord} disabled={uploading}>
                Re-record
              </Button>
              <Button variant="contained" color="success" size="large" onClick={handleSubmitAnswer} disabled={uploading}>
                {uploading ? "Uploading..." : "Submit Answer"}
              </Button>
            </>
          )}
        </Box>
      </Box>
    );
  }

  if (viva.status === "completed") {
    return (
      <Box sx={{ p: 4, textAlign: "center", maxWidth: 500, mx: "auto", mt: 8 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>Viva Completed!</Typography>
        <Typography sx={{ mb: 4 }}>
          Your answers have been submitted. Our AI will grade them shortly, and a human reviewer will provide the final decision.
        </Typography>
        <Button variant="contained" onClick={() => router.push("/jobs")}>
          Return to Jobs
        </Button>
      </Box>
    );
  }

  // Fallback for grading/graded etc if candidate revisits
  return (
    <Box sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="h5">Your Viva is under review.</Typography>
    </Box>
  );
}
