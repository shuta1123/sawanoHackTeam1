// QRコード読取コンポーネント（README MVP機能一覧 / PCアプリ「QRコード読取(PCカメラ)」に対応）。
//
// 処理の流れ:
//  1. navigator.mediaDevices.getUserMedia でPCカメラ映像を<video>に流す
//  2. 毎フレーム<canvas>に1枚描画し、そのピクセルデータをjsQRに渡してQRコードを検出する
//  3. 検出できたら、デコードされた文字列(userId)が期待するuserIdと一致するか確認
//  4. 一致していれば POST /api/alarm/dismiss を呼び出してアラームを解除する
'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import styles from './QRScanner.module.css';

type ScanState = 'starting' | 'scanning' | 'success' | 'error';

interface QRScannerProps {
  /** このPCが担当するuserId（DEFAULT_USER_ID）。QRコードの内容と一致するかの照合に使う */
  expectedUserId: string;
  /** アラーム解除に成功した直後に呼ばれるコールバック（履歴の再取得トリガー用） */
  onDismissed: () => void;
}

export default function QRScanner({ expectedUserId, onDismissed }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafIdRef = useRef<number | null>(null);
  // API呼び出し中に同じQRコードを何度も読み取って二重送信してしまうのを防ぐフラグ
  const isProcessingRef = useRef(false);

  const [state, setState] = useState<ScanState>('starting');
  const [message, setMessage] = useState('カメラを起動しています…');

  useEffect(() => {
    let mediaStream: MediaStream | null = null;

    async function startCamera() {
      try {
        // facingMode: 'user' は内蔵/外付けの通常カメラを指定する一般的な値
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }

        setState('scanning');
        setMessage('iPhoneのQRコードをカメラに向けてください');
        scanLoop();
      } catch (err) {
        console.error('カメラの起動に失敗:', err);
        setState('error');
        setMessage('カメラを起動できませんでした。OS/ブラウザのカメラ権限設定を確認してください。');
      }
    }

    // requestAnimationFrameで毎フレーム呼ばれる、QRコード検出ループ
    function scanLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // video.readyState が HAVE_ENOUGH_DATA 未満の間はまだ描画できる映像がない
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafIdRef.current = requestAnimationFrame(scanLoop);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafIdRef.current = requestAnimationFrame(scanLoop);
        return;
      }

      // canvasのサイズを映像の実サイズに合わせてから描画する
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // jsQRはRGBAのピクセル配列(Uint8ClampedArray)を受け取ってQRコードを解析する
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const detected = jsQR(imageData.data, imageData.width, imageData.height);

      if (detected && !isProcessingRef.current) {
        handleDetected(detected.data);
      } else {
        rafIdRef.current = requestAnimationFrame(scanLoop);
      }
    }

    // QRコードのデコード結果(userId文字列)を受け取って解除処理を行う
    async function handleDetected(rawValue: string) {
      isProcessingRef.current = true;
      const scannedUserId = rawValue.trim();

      // README 設計決定 #3: QRには userId をエンコードする。
      // ここでこのPCが担当するuserIdと一致するかを照合し、他人のQRで誤って解除されないようにする。
      if (scannedUserId !== expectedUserId) {
        setMessage('このQRコードは設定中のユーザーと一致しません');
        isProcessingRef.current = false;
        rafIdRef.current = requestAnimationFrame(scanLoop);
        return;
      }

      setMessage('解除中…');

      try {
        const res = await fetch('/api/alarm/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: scannedUserId }),
        });

        if (!res.ok) {
          throw new Error(`dismiss API failed with status ${res.status}`);
        }

        setState('success');
        setMessage('アラームを解除しました。おはようございます！');
        onDismissed();
        stopCamera();
      } catch (err) {
        console.error('アラーム解除に失敗:', err);
        setMessage('解除に失敗しました。もう一度QRコードを読み取ってください。');
        isProcessingRef.current = false;
        rafIdRef.current = requestAnimationFrame(scanLoop);
      }
    }

    function stopCamera() {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      mediaStream?.getTracks().forEach((track) => track.stop());
    }

    startCamera();

    // コンポーネントが破棄される時は必ずカメラとループを止める（メモリリーク・カメラ占有を防ぐ）
    return () => {
      stopCamera();
    };
  }, [expectedUserId, onDismissed]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.frame} data-state={state}>
        {/* 実際に表示する映像。PCカメラは鏡像になることが多いのでCSSで反転させている */}
        <video ref={videoRef} className={styles.video} muted playsInline />
        {/* 画面には表示しない、QR検出専用の作業用canvas */}
        <canvas ref={canvasRef} className={styles.hiddenCanvas} />
        {/* デザイン上の唯一のサイン要素: 解除成功時に朝日のように発光する弧 */}
        <div className={styles.horizon} aria-hidden="true" />
      </div>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
