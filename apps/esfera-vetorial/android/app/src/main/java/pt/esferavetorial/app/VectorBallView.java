package pt.esferavetorial.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Locale;

public final class VectorBallView extends View {
    private final BallPhysics physics = new BallPhysics();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final ArrayDeque<PointF> trail = new ArrayDeque<>();

    private static final int APP_MENU = 0;
    private static final int APP_MODE_1 = 1;
    private static final int APP_MODE_2 = 2;

    private int appMode = APP_MENU;

    private final RectF menuMode1 = new RectF();
    private final RectF menuMode2 = new RectF();
    private final RectF menuButton = new RectF();

    // Modo 1
    private final RectF[] buttons = new RectF[6];
    private final RectF frictionToggle = new RectF();
    private final RectF massSlider = new RectF();

    private static final float CONTROL_DEAD_ZONE = 0.10f;
    private static final float CONTROL_GAIN = 0.035f;
    private static final float TRACK_PENALTY_SECONDS = 2.0f;
    private static final long TRACK_HIT_COOLDOWN_MS = 350L;

    private static final float[][][] TRACKS = new float[][][] {
            {
                    {0.16f, 0.84f}, {0.16f, 0.68f}, {0.38f, 0.58f},
                    {0.28f, 0.40f}, {0.52f, 0.29f}, {0.76f, 0.38f}, {0.82f, 0.16f}
            },
            {
                    {0.15f, 0.84f}, {0.33f, 0.74f}, {0.20f, 0.59f},
                    {0.50f, 0.50f}, {0.76f, 0.58f}, {0.67f, 0.36f},
                    {0.40f, 0.27f}, {0.72f, 0.15f}
            },
            // Pista 3: circuito oval, partida/meta no ponto inferior.
            {
                    {0.50f, 0.82f}, {0.62f, 0.79f}, {0.72f, 0.70f},
                    {0.79f, 0.58f}, {0.80f, 0.45f}, {0.75f, 0.32f},
                    {0.65f, 0.23f}, {0.50f, 0.20f}, {0.35f, 0.23f},
                    {0.25f, 0.32f}, {0.20f, 0.45f}, {0.21f, 0.58f},
                    {0.28f, 0.70f}, {0.38f, 0.79f}, {0.50f, 0.82f}
            }
    };

    private static final float[] TRACK_HALF_WIDTHS_M = {0.0105f, 0.0095f, 0.0095f};

    private float sensorX, sensorY, sensorZ = 9.81f;
    private float zeroX, zeroY;
    private float controlGravityX, controlGravityY;
    private boolean calibrated;
    private boolean sensorAvailable = true;
    private boolean accelerometerFallback;

    private float widthM = 0.075f;
    private float heightM = 0.160f;
    private float pixelsPerMeter;
    private final float radiusM = 0.0043f;

    private int systemBottomInsetPx;

    private long lastFrameNanos;
    private long challengeStartMs;
    private long targetStableSinceMs;
    private long impactVisibleUntilMs;
    private float shownAx, shownAy;
    private float maxSpeed;
    private int score;
    private boolean success;

    private int mode;
    private boolean showVectors = true;
    private boolean showTrail = true;
    private boolean draggingMass;
    private float massSetting = 0.88f;

    private boolean trackStarted;
    private boolean trackFinished;
    private long trackStartMs;
    private long trackFinishMs;
    private long lastTrackHitMs;
    private int trackHits;
    private float trackPenaltySeconds;
    private boolean trackWallContact;
    private float trackMaxProgress;

    private final float targetXFraction = 0.75f;
    private final float targetYFraction = 0.46f;
    private final float targetRadiusM = 0.018f;

    // Modo 2: trajetória desenhada
    private final ArrayList<PointF> trajectory = new ArrayList<>();
    private float[] trajectoryCum = new float[0];
    private float trajectoryTotalM;
    private float trajectoryS;
    private float trajectoryX, trajectoryY;
    private float trajectoryVx, trajectoryVy;
    private float trajectoryAx, trajectoryAy;
    private float previousTrajectoryVx, previousTrajectoryVy;
    private boolean firstTrajectoryVelocity = true;
    private boolean trajectoryDrawing;
    private boolean trajectoryReady;
    private boolean trajectoryRunning;
    private boolean trajectoryFinished;
    private boolean showComponents;
    private static final float TRAJECTORY_SPEED_MIN = 0.01f;
    private static final float TRAJECTORY_SPEED_MAX = 0.06f;
    private static final float[] TRAJECTORY_TIME_SCALES = {1f, 0.5f, 0.25f, 0.125f};
    private float initialSpeed = 0.04f;
    private int trajectoryTimeScaleIndex;
    private boolean draggingSpeed;

    private final RectF speedSlider = new RectF();
    private final RectF[] trajectoryButtons = new RectF[4];

    private final float density;

    private static final class NearestPoint {
        float x;
        float y;
        float distance;
        int segment;
        float u;
        float progress;
    }

    private static final class MotionSample {
        float x;
        float y;
        float tx;
        float ty;
    }

    public VectorBallView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        textPaint.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.NORMAL));
        setBackgroundColor(Color.rgb(247, 249, 252));
        setFocusable(true);
        for (int i = 0; i < buttons.length; i++) buttons[i] = new RectF();
        for (int i = 0; i < trajectoryButtons.length; i++) trajectoryButtons[i] = new RectF();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        requestApplyInsets();
    }

    @Override
    public WindowInsets onApplyWindowInsets(WindowInsets insets) {
        int newBottom = insets.getSystemWindowInsetBottom();
        if (newBottom != systemBottomInsetPx) {
            systemBottomInsetPx = newBottom;
            invalidate();
        }
        return insets;
    }

    public void setSensorAvailable(boolean available, boolean fallback) {
        sensorAvailable = available;
        accelerometerFallback = fallback;
    }

    public void setGravity(float x, float y, float z) {
        sensorX = x;
        sensorY = y;
        sensorZ = z;
        if (!calibrated) calibratePlane(false);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        heightM = 0.160f;
        widthM = heightM * ((float) w / (float) h);
        pixelsPerMeter = w / widthM;
        if (appMode == APP_MODE_1) resetSimulation();
        invalidate();
    }

    private float px(float meters) {
        return meters * pixelsPerMeter;
    }

    private float meters(float pixels) {
        return pixelsPerMeter > 0f ? pixels / pixelsPerMeter : 0f;
    }

    private void drawStartMenu(Canvas canvas) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(247, 249, 252));
        canvas.drawRect(0, 0, getWidth(), getHeight(), paint);

        float cx = getWidth() * 0.5f;
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setColor(Color.rgb(28, 35, 50));
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(28f * density);
        canvas.drawText("Esfera Vetorial", cx, 82f * density, textPaint);
        textPaint.setFakeBoldText(false);
        textPaint.setTextSize(14f * density);
        textPaint.setColor(Color.rgb(90, 99, 113));
        canvas.drawText("Escolha a experiência", cx, 110f * density, textPaint);

        float margin = 22f * density;
        float gap = 18f * density;
        float top = 150f * density;
        float available = getHeight() - systemBottomInsetPx - top - 112f * density;
        float cardH = Math.min(176f * density, (available - gap) / 2f);
        menuMode1.set(margin, top, getWidth() - margin, top + cardH);
        menuMode2.set(margin, top + cardH + gap, getWidth() - margin, top + cardH * 2f + gap);

        drawMenuCard(canvas, menuMode1, "MODO 1", "Esfera livre e jogos",
                "Inclinação do telemóvel • alvos • pistas • colisões", Color.rgb(44, 83, 150));
        drawMenuCard(canvas, menuMode2, "MODO 2", "Trajetória desenhada",
                "Desenhe uma curva • escolha v₀ • observe v e a", Color.rgb(117, 74, 140));

        float creditY = getHeight() - systemBottomInsetPx - 58f * density;
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setFakeBoldText(false);
        textPaint.setColor(Color.rgb(78, 86, 101));
        textPaint.setTextSize(10.5f * density);
        canvas.drawText("Idealizado e desenvolvido por Carlos Brás @ Clube Ciência Viva Abel Salazar-",
                cx, creditY, textPaint);
        canvas.drawText("junho 2026. (Programação com recurso IA).",
                cx, creditY + 17f * density, textPaint);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawMenuCard(Canvas canvas, RectF r, String kicker, String title, String subtitle, int accent) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.WHITE);
        canvas.drawRoundRect(r, 18f * density, 18f * density, paint);
        paint.setColor(accent);
        canvas.drawRoundRect(new RectF(r.left, r.top, r.left + 7f * density, r.bottom),
                18f * density, 18f * density, paint);

        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setColor(accent);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(12f * density);
        canvas.drawText(kicker, r.left + 24f * density, r.top + 34f * density, textPaint);
        textPaint.setColor(Color.rgb(30, 36, 48));
        textPaint.setTextSize(20f * density);
        canvas.drawText(title, r.left + 24f * density, r.top + 68f * density, textPaint);
        textPaint.setFakeBoldText(false);
        textPaint.setColor(Color.rgb(88, 97, 110));
        textPaint.setTextSize(13f * density);
        canvas.drawText(subtitle, r.left + 24f * density, r.top + 99f * density, textPaint);
        textPaint.setColor(accent);
        textPaint.setFakeBoldText(true);
        canvas.drawText("ABRIR  ›", r.left + 24f * density, r.bottom - 24f * density, textPaint);
        textPaint.setFakeBoldText(false);
    }

    private void drawSmallMenuButton(Canvas canvas, float top) {
        float w = 62f * density;
        float h = 28f * density;
        menuButton.set(getWidth() - 12f * density - w, top, getWidth() - 12f * density, top + h);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(75, 83, 98));
        canvas.drawRoundRect(menuButton, 10f * density, 10f * density, paint);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setColor(Color.WHITE);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(10.5f * density);
        canvas.drawText("MENU", menuButton.centerX(), menuButton.centerY() + 4f * density, textPaint);
        textPaint.setFakeBoldText(false);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    // ---------------------------------------------------------------------
    // MODO 1
    // ---------------------------------------------------------------------

    private float buttonRowsTopPx() {
        float margin = 8f * density;
        float gap = 6f * density;
        float h = 40f * density;
        float y2 = getHeight() - systemBottomInsetPx - margin - h;
        return y2 - gap - h;
    }

    private float controlsTopPx() {
        return buttonRowsTopPx() - 62f * density;
    }

    private float playableHeightM() {
        if (pixelsPerMeter <= 0f) return heightM;
        float bottomPx = Math.max(px(radiusM * 2f), controlsTopPx() - 10f * density);
        return Math.min(heightM, bottomPx / pixelsPerMeter);
    }

    private boolean isTrackMode() {
        return mode >= 3;
    }

    private int trackIndex() {
        return Math.max(0, Math.min(2, mode - 3));
    }

    private float trackX(int index, int point) {
        return widthM * TRACKS[index][point][0];
    }

    private float trackY(int index, int point) {
        return playableHeightM() * TRACKS[index][point][1];
    }

    private void resetSimulation() {
        physics.reset(widthM, playableHeightM());
        if (isTrackMode()) {
            int t = trackIndex();
            physics.x = trackX(t, 0);
            physics.y = trackY(t, 0);
            physics.vx = 0f;
            physics.vy = 0f;
        }
        trail.clear();
        controlGravityX = controlGravityY = 0f;
        shownAx = shownAy = 0f;
        impactVisibleUntilMs = 0L;
        maxSpeed = 0f;
        score = 0;
        success = false;
        targetStableSinceMs = 0L;
        challengeStartMs = SystemClock.elapsedRealtime();
        lastFrameNanos = 0L;

        trackStarted = false;
        trackFinished = false;
        trackStartMs = 0L;
        trackFinishMs = 0L;
        lastTrackHitMs = 0L;
        trackHits = 0;
        trackPenaltySeconds = 0f;
        trackWallContact = false;
        trackMaxProgress = 0f;
        invalidate();
    }

    private void calibratePlane(boolean reset) {
        zeroX = sensorX;
        zeroY = sensorY;
        controlGravityX = controlGravityY = 0f;
        calibrated = true;
        if (reset && appMode == APP_MODE_1) resetSimulation();
    }

    private float deadZone(float value) {
        float abs = Math.abs(value);
        if (abs <= CONTROL_DEAD_ZONE) return 0f;
        return Math.copySign(abs - CONTROL_DEAD_ZONE, value);
    }

    private float controlTauSeconds() {
        float shaped = (float) Math.pow(massSetting, 1.55);
        return 0.06f + 1.34f * shaped;
    }

    private void drawMode1(Canvas canvas, float dt, long nowMs) {
        float rawGravityX = -(sensorX - zeroX);
        float rawGravityY = (sensorY - zeroY);
        float requestedX = CONTROL_GAIN * deadZone(rawGravityX);
        float requestedY = CONTROL_GAIN * deadZone(rawGravityY);
        float smoothing = 1f - (float) Math.exp(-dt / controlTauSeconds());
        controlGravityX += smoothing * (requestedX - controlGravityX);
        controlGravityY += smoothing * (requestedY - controlGravityY);

        physics.update(dt, controlGravityX, controlGravityY,
                widthM, playableHeightM(), radiusM);

        trackWallContact = false;
        if (isTrackMode() && !trackFinished) {
            constrainToTrack(nowMs);
            updateTrackChallenge(nowMs);
        }

        if (physics.collidedThisFrame || trackWallContact) {
            shownAx = physics.displayAx;
            shownAy = physics.displayAy;
            impactVisibleUntilMs = nowMs + 140L;
        } else if (nowMs >= impactVisibleUntilMs) {
            shownAx = physics.ax;
            shownAy = physics.ay;
        }

        maxSpeed = Math.max(maxSpeed, physics.speed());
        updateChallenge();
        updateTrail();

        drawGrid(canvas, controlsTopPx());
        if (isTrackMode()) drawTrack(canvas);
        else if (mode != 0) drawTarget(canvas);
        if (showTrail) drawTrail(canvas);
        drawBall(canvas, physics.x, physics.y, physics.distance);
        if (nowMs < impactVisibleUntilMs) drawImpactHalo(canvas, physics.x, physics.y, trackWallContact);
        if (showVectors) drawVectorSet(canvas, physics.x, physics.y,
                physics.vx, physics.vy, shownAx, shownAy,
                1950f * density, 1180f * density,
                Math.min(getWidth() * 1.05f, 380f * density), false);
        drawHudMode1(canvas, nowMs);
        drawParameterPanel(canvas);
        drawButtons(canvas);
        if (success) drawSuccess(canvas, nowMs);
        drawSmallMenuButton(canvas, 16f * density);
    }

    private void updateTrail() {
        if (!showTrail) return;
        float x = px(physics.x);
        float y = px(physics.y);
        PointF last = trail.peekLast();
        if (last == null || Math.hypot(x - last.x, y - last.y) > 3.0f * density) {
            trail.addLast(new PointF(x, y));
            while (trail.size() > 260) trail.removeFirst();
        }
    }

    private void updateChallenge() {
        if (mode == 0 || isTrackMode() || success) return;
        float tx = widthM * targetXFraction;
        float ty = playableHeightM() * targetYFraction;
        float distance = (float) Math.hypot(physics.x - tx, physics.y - ty);
        boolean inTarget = distance < targetRadiusM - radiusM * 0.15f;
        boolean stopped = physics.speed() < 0.040f;
        long now = SystemClock.elapsedRealtime();

        if (inTarget && stopped) {
            if (targetStableSinceMs == 0L) targetStableSinceMs = now;
            if (now - targetStableSinceMs >= 700L) {
                if (mode == 2 && maxSpeed > 0.40f) {
                    targetStableSinceMs = 0L;
                } else {
                    success = true;
                    float elapsed = (now - challengeStartMs) / 1000f;
                    score = Math.max(100, Math.round(1200f - 32f * elapsed - 280f * maxSpeed));
                }
            }
        } else targetStableSinceMs = 0L;
    }

    private NearestPoint nearestPointOnTrack(int track, float x, float y) {
        NearestPoint result = new NearestPoint();
        result.distance = Float.MAX_VALUE;
        float[][] points = TRACKS[track];
        for (int i = 0; i < points.length - 1; i++) {
            float x1 = trackX(track, i);
            float y1 = trackY(track, i);
            float x2 = trackX(track, i + 1);
            float y2 = trackY(track, i + 1);
            float dx = x2 - x1;
            float dy = y2 - y1;
            float length2 = dx * dx + dy * dy;
            float u = length2 > 1e-8f ? ((x - x1) * dx + (y - y1) * dy) / length2 : 0f;
            u = Math.max(0f, Math.min(1f, u));
            float qx = x1 + u * dx;
            float qy = y1 + u * dy;
            float d = (float) Math.hypot(x - qx, y - qy);
            if (d < result.distance) {
                result.distance = d;
                result.x = qx;
                result.y = qy;
                result.segment = i;
                result.u = u;
                result.progress = (i + u) / (points.length - 1f);
            }
        }
        return result;
    }

    private void constrainToTrack(long nowMs) {
        int t = trackIndex();
        NearestPoint nearest = nearestPointOnTrack(t, physics.x, physics.y);
        trackMaxProgress = Math.max(trackMaxProgress, nearest.progress);
        float allowed = Math.max(0.0015f, TRACK_HALF_WIDTHS_M[t] - radiusM);
        if (nearest.distance <= allowed) return;

        float nx, ny;
        if (nearest.distance > 1e-6f) {
            nx = (physics.x - nearest.x) / nearest.distance;
            ny = (physics.y - nearest.y) / nearest.distance;
        } else {
            nx = 1f;
            ny = 0f;
        }

        physics.x = nearest.x + nx * allowed * 0.96f;
        physics.y = nearest.y + ny * allowed * 0.96f;
        float normalSpeed = physics.vx * nx + physics.vy * ny;
        if (normalSpeed > 0f) {
            physics.vx -= 1.10f * normalSpeed * nx;
            physics.vy -= 1.10f * normalSpeed * ny;
        }
        physics.vx *= 0.42f;
        physics.vy *= 0.42f;
        trackWallContact = true;

        if (nowMs - lastTrackHitMs >= TRACK_HIT_COOLDOWN_MS) {
            trackHits++;
            trackPenaltySeconds += TRACK_PENALTY_SECONDS;
            lastTrackHitMs = nowMs;
        }
    }

    private void updateTrackChallenge(long nowMs) {
        int t = trackIndex();
        float sx = trackX(t, 0);
        float sy = trackY(t, 0);
        int last = TRACKS[t].length - 1;
        float fx = trackX(t, last);
        float fy = trackY(t, last);

        if (!trackStarted) {
            float fromStart = (float) Math.hypot(physics.x - sx, physics.y - sy);
            if (fromStart > 0.0075f) {
                trackStarted = true;
                trackStartMs = nowMs;
            }
            return;
        }

        if (!trackFinished) {
            float toFinish = (float) Math.hypot(physics.x - fx, physics.y - fy);
            boolean lapGate = t != 2 || trackMaxProgress > 0.86f;
            if (lapGate && toFinish < 0.0080f) {
                trackFinished = true;
                trackFinishMs = nowMs;
                success = true;
                float finalTime = trackTotalSeconds(nowMs);
                score = Math.max(100, Math.round(5000f - finalTime * 90f - trackHits * 180f));
            }
        }
    }

    private float trackRawSeconds(long nowMs) {
        if (!trackStarted) return 0f;
        long end = trackFinished ? trackFinishMs : nowMs;
        return Math.max(0f, (end - trackStartMs) / 1000f);
    }

    private float trackTotalSeconds(long nowMs) {
        return trackRawSeconds(nowMs) + trackPenaltySeconds;
    }

    private void drawGrid(Canvas canvas, float bottomPx) {
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1f);
        paint.setColor(Color.rgb(224, 229, 236));
        float step = px(0.02f);
        for (float x = step; x < getWidth(); x += step) canvas.drawLine(x, 0, x, bottomPx, paint);
        for (float y = step; y < bottomPx; y += step) canvas.drawLine(0, y, getWidth(), y, paint);
    }

    private void drawTarget(Canvas canvas) {
        float tx = px(widthM * targetXFraction);
        float ty = px(playableHeightM() * targetYFraction);
        float tr = px(targetRadiusM);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(40, 30, 160, 80));
        canvas.drawCircle(tx, ty, tr, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f * density);
        paint.setColor(Color.rgb(30, 150, 80));
        canvas.drawCircle(tx, ty, tr, paint);
    }

    private void buildTrackPath(int t) {
        path.reset();
        path.moveTo(px(trackX(t, 0)), px(trackY(t, 0)));
        for (int i = 1; i < TRACKS[t].length; i++) path.lineTo(px(trackX(t, i)), px(trackY(t, i)));
    }

    private void drawTrack(Canvas canvas) {
        int t = trackIndex();
        buildTrackPath(t);
        float corridorWidth = px(TRACK_HALF_WIDTHS_M[t] * 2f);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(corridorWidth + 3.2f * density);
        paint.setColor(Color.rgb(78, 87, 102));
        canvas.drawPath(path, paint);
        paint.setStrokeWidth(corridorWidth);
        paint.setColor(Color.rgb(236, 240, 246));
        canvas.drawPath(path, paint);
        paint.setStrokeWidth(1.1f * density);
        paint.setColor(Color.rgb(165, 175, 190));
        canvas.drawPath(path, paint);

        float startX = px(trackX(t, 0));
        float startY = px(trackY(t, 0));
        int last = TRACKS[t].length - 1;
        float finishX = px(trackX(t, last));
        float finishY = px(trackY(t, last));
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(115, 45, 160, 90));
        canvas.drawCircle(startX, startY, px(0.0080f), paint);
        paint.setColor(Color.argb(135, 230, 165, 35));
        canvas.drawCircle(finishX, finishY, px(0.0060f), paint);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(9.5f * density);
        textPaint.setColor(Color.rgb(30, 105, 65));
        canvas.drawText(t == 2 ? "PARTIDA / META" : "PARTIDA", startX, startY - px(0.010f), textPaint);
        if (t != 2) {
            textPaint.setColor(Color.rgb(150, 95, 15));
            canvas.drawText("META", finishX, finishY - px(0.010f), textPaint);
        }
        textPaint.setFakeBoldText(false);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawTrail(Canvas canvas) {
        if (trail.size() < 2) return;
        path.reset();
        boolean first = true;
        for (PointF point : trail) {
            if (first) { path.moveTo(point.x, point.y); first = false; }
            else path.lineTo(point.x, point.y);
        }
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.4f * density);
        paint.setColor(Color.argb(110, 80, 90, 110));
        canvas.drawPath(path, paint);
    }

    private void drawHudMode1(Canvas canvas, long nowMs) {
        float pad = 12f * density;
        float boxTop = 10f * density;
        float boxHeight = isTrackMode() ? 137f * density : 118f * density;
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(220, 255, 255, 255));
        canvas.drawRoundRect(new RectF(pad, boxTop, getWidth() - pad, boxTop + boxHeight), 14f * density, 14f * density, paint);
        textPaint.setColor(Color.rgb(25, 30, 42));
        textPaint.setTextSize(18f * density);
        textPaint.setFakeBoldText(true);
        canvas.drawText("Esfera Vetorial", pad + 12f * density, boxTop + 25f * density, textPaint);
        textPaint.setFakeBoldText(false);
        textPaint.setTextSize(13f * density);
        String model = physics.realSphere ? "esfera maciça (5/7)" : "modelo ideal (1)";
        canvas.drawText("Modo 1 • " + modeName() + "   •   " + model, pad + 12f * density, boxTop + 47f * density, textPaint);
        textPaint.setTextSize(14f * density);
        textPaint.setColor(Color.rgb(22, 92, 210));
        canvas.drawText(String.format(Locale.US, "v = %.2f m/s   (vx %.2f | vy %.2f)", physics.speed(), physics.vx, physics.vy), pad + 12f * density, boxTop + 70f * density, textPaint);
        textPaint.setColor(Color.rgb(220, 55, 55));
        canvas.drawText(String.format(Locale.US, "a = %.2f m/s²  (ax %.2f | ay %.2f)", Math.hypot(shownAx, shownAy), shownAx, shownAy), pad + 12f * density, boxTop + 92f * density, textPaint);
        textPaint.setColor(Color.rgb(80, 88, 100));
        textPaint.setTextSize(11f * density);
        String sensor = !sensorAvailable ? "Sensor indisponível" : (accelerometerFallback ? "Acelerómetro filtrado" : "Sensor de gravidade");
        canvas.drawText(String.format(Locale.US, "%s • percurso %.2f m", sensor, physics.distance), pad + 12f * density, boxTop + 111f * density, textPaint);
        if (isTrackMode()) {
            textPaint.setFakeBoldText(true);
            textPaint.setTextSize(11.5f * density);
            textPaint.setColor(Color.rgb(95, 63, 20));
            String timer = !trackStarted ? "Saia da PARTIDA para iniciar o cronómetro" : String.format(Locale.US, "Tempo %.2f s + penal. %.0f s = %.2f s   •   toques %d", trackRawSeconds(nowMs), trackPenaltySeconds, trackTotalSeconds(nowMs), trackHits);
            canvas.drawText(timer, pad + 12f * density, boxTop + 130f * density, textPaint);
            textPaint.setFakeBoldText(false);
        }
    }

    private String modeName() {
        switch (mode) {
            case 0: return "Exploração";
            case 1: return "Parar no alvo";
            case 2: return "Alvo: v máx. 0,40 m/s";
            case 3: return "Pista 1";
            case 4: return "Pista 2";
            case 5: return "Pista 3 oval";
            default: return "Exploração";
        }
    }

    private String modeButtonLabel() {
        switch (mode) {
            case 0: return "Explorar";
            case 1: return "Alvo";
            case 2: return "Alvo ≤0,40";
            case 3: return "Pista 1";
            case 4: return "Pista 2";
            case 5: return "Pista oval";
            default: return "Explorar";
        }
    }

    private void drawParameterPanel(Canvas canvas) {
        float margin = 8f * density;
        RectF panel = new RectF(margin, controlsTopPx(), getWidth() - margin, buttonRowsTopPx() - 7f * density);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(232, 255, 255, 255));
        canvas.drawRoundRect(panel, 12f * density, 12f * density, paint);
        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setTextSize(11.5f * density);
        textPaint.setColor(Color.rgb(45, 52, 66));
        textPaint.setFakeBoldText(true);
        canvas.drawText(String.format(Locale.US, "Massa  %d%%", Math.round(massSetting * 100f)), panel.left + 12f * density, panel.top + 19f * density, textPaint);
        textPaint.setFakeBoldText(false);

        float toggleW = 86f * density;
        float toggleH = 27f * density;
        frictionToggle.set(panel.right - toggleW - 8f * density, panel.top + 6f * density, panel.right - 8f * density, panel.top + 6f * density + toggleH);
        paint.setColor(physics.frictionEnabled ? Color.rgb(43, 125, 80) : Color.rgb(95, 103, 118));
        canvas.drawRoundRect(frictionToggle, 10f * density, 10f * density, paint);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setTextSize(11f * density);
        textPaint.setColor(Color.WHITE);
        textPaint.setFakeBoldText(true);
        canvas.drawText(physics.frictionEnabled ? "Atrito ON" : "Atrito OFF", frictionToggle.centerX(), frictionToggle.centerY() + 4f * density, textPaint);
        textPaint.setFakeBoldText(false);

        float sliderLeft = panel.left + 14f * density;
        float sliderRight = panel.right - 14f * density;
        float sliderY = panel.bottom - 14f * density;
        massSlider.set(sliderLeft, sliderY - 13f * density, sliderRight, sliderY + 13f * density);
        drawSlider(canvas, sliderLeft, sliderRight, sliderY, massSetting, Color.rgb(55, 77, 126));
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawSlider(Canvas canvas, float left, float right, float y, float value, int knobColor) {
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(3f * density);
        paint.setColor(Color.rgb(180, 188, 199));
        canvas.drawLine(left, y, right, y, paint);
        float knobX = left + value * (right - left);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(knobColor);
        canvas.drawCircle(knobX, y, 7f * density, paint);
    }

    private void drawButtons(Canvas canvas) {
        String[] labels = {"Reiniciar", "Calibrar", physics.realSphere ? "Esfera real" : "Ideal", modeButtonLabel(), showVectors ? "Vetores ✓" : "Vetores", showTrail ? "Rasto ✓" : "Rasto"};
        float margin = 8f * density;
        float gap = 6f * density;
        float h = 40f * density;
        float totalW = getWidth() - 2f * margin;
        float w = (totalW - 2f * gap) / 3f;
        float y2 = getHeight() - systemBottomInsetPx - margin - h;
        float y1 = y2 - gap - h;
        for (int i = 0; i < 6; i++) {
            int col = i % 3;
            int row = i / 3;
            float left = margin + col * (w + gap);
            float top = row == 0 ? y1 : y2;
            buttons[i].set(left, top, left + w, top + h);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(Color.argb(232, 35, 44, 62));
            canvas.drawRoundRect(buttons[i], 10f * density, 10f * density, paint);
            textPaint.setTextAlign(Paint.Align.CENTER);
            textPaint.setTextSize(11.5f * density);
            textPaint.setColor(Color.WHITE);
            textPaint.setFakeBoldText(i == 1);
            canvas.drawText(labels[i], buttons[i].centerX(), buttons[i].centerY() + 4f * density, textPaint);
            textPaint.setFakeBoldText(false);
        }
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawSuccess(Canvas canvas, long nowMs) {
        float cx = getWidth() * 0.5f;
        float cy = controlsTopPx() * 0.70f;
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(238, 24, 135, 72));
        RectF box = new RectF(cx - 135f * density, cy - 58f * density, cx + 135f * density, cy + 58f * density);
        canvas.drawRoundRect(box, 18f * density, 18f * density, paint);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setColor(Color.WHITE);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(21f * density);
        canvas.drawText(isTrackMode() ? "Pista concluída" : "Objetivo atingido", cx, cy - 20f * density, textPaint);
        if (isTrackMode()) {
            textPaint.setTextSize(15f * density);
            canvas.drawText(String.format(Locale.US, "Tempo final: %.2f s", trackTotalSeconds(nowMs)), cx, cy + 5f * density, textPaint);
            textPaint.setTextSize(13f * density);
            canvas.drawText(String.format(Locale.US, "%d toques • %.0f s de penalização", trackHits, trackPenaltySeconds), cx, cy + 28f * density, textPaint);
        } else {
            textPaint.setTextSize(16f * density);
            canvas.drawText("Pontuação: " + score, cx, cy + 15f * density, textPaint);
        }
        textPaint.setFakeBoldText(false);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    // ---------------------------------------------------------------------
    // MODO 2 - TRAJETÓRIA DESENHADA
    // ---------------------------------------------------------------------

    private float trajectoryHudBottomPx() {
        return 142f * density;
    }

    private float trajectoryButtonsTopPx() {
        float h = 40f * density;
        float gap = 6f * density;
        float margin = 8f * density;
        float y2 = getHeight() - systemBottomInsetPx - margin - h;
        return y2 - gap - h;
    }

    private float trajectoryControlsTopPx() {
        return trajectoryButtonsTopPx() - 62f * density;
    }

    private boolean inTrajectoryDrawingArea(float yPx) {
        return yPx > trajectoryHudBottomPx() + 8f * density && yPx < trajectoryControlsTopPx() - 8f * density;
    }

    private void clearTrajectory() {
        trajectory.clear();
        trajectoryCum = new float[0];
        trajectoryTotalM = 0f;
        trajectoryS = 0f;
        trajectoryVx = trajectoryVy = trajectoryAx = trajectoryAy = 0f;
        trajectoryDrawing = false;
        trajectoryReady = false;
        trajectoryRunning = false;
        trajectoryFinished = false;
        firstTrajectoryVelocity = true;
        invalidate();
    }

    private void beginTrajectory(float xPx, float yPx) {
        clearTrajectory();
        trajectoryDrawing = true;
        trajectory.add(new PointF(meters(xPx), meters(yPx)));
    }

    private void appendTrajectory(float xPx, float yPx) {
        PointF p = new PointF(meters(xPx), meters(yPx));
        if (trajectory.isEmpty()) {
            trajectory.add(p);
            return;
        }
        PointF last = trajectory.get(trajectory.size() - 1);
        if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.0012f) trajectory.add(p);
    }

    private void finishTrajectoryDrawing() {
        trajectoryDrawing = false;
        if (trajectory.size() < 3) {
            clearTrajectory();
            return;
        }
        smoothTrajectory();
        rebuildTrajectoryLengths();
        trajectoryReady = trajectoryTotalM > 0.015f;
        trajectoryS = 0f;
        if (trajectoryReady) {
            MotionSample s = sampleTrajectory(0f);
            trajectoryX = s.x;
            trajectoryY = s.y;
        }
        invalidate();
    }

    private void smoothTrajectory() {
        // Duas passagens de Chaikin: preserva o gesto mas suaviza cantos e ruído do dedo.
        for (int pass = 0; pass < 2; pass++) {
            if (trajectory.size() < 3) return;
            ArrayList<PointF> out = new ArrayList<>();
            out.add(new PointF(trajectory.get(0).x, trajectory.get(0).y));
            for (int i = 0; i < trajectory.size() - 1; i++) {
                PointF a = trajectory.get(i);
                PointF b = trajectory.get(i + 1);
                out.add(new PointF(0.75f * a.x + 0.25f * b.x, 0.75f * a.y + 0.25f * b.y));
                out.add(new PointF(0.25f * a.x + 0.75f * b.x, 0.25f * a.y + 0.75f * b.y));
            }
            PointF last = trajectory.get(trajectory.size() - 1);
            out.add(new PointF(last.x, last.y));
            trajectory.clear();
            trajectory.addAll(out);
            if (trajectory.size() > 900) break;
        }
    }

    private void rebuildTrajectoryLengths() {
        trajectoryCum = new float[trajectory.size()];
        trajectoryCum[0] = 0f;
        for (int i = 1; i < trajectory.size(); i++) {
            PointF a = trajectory.get(i - 1);
            PointF b = trajectory.get(i);
            trajectoryCum[i] = trajectoryCum[i - 1] + (float) Math.hypot(b.x - a.x, b.y - a.y);
        }
        trajectoryTotalM = trajectoryCum[trajectoryCum.length - 1];
    }

    private MotionSample sampleTrajectory(float s) {
        MotionSample result = new MotionSample();
        if (trajectory.size() < 2 || trajectoryTotalM <= 0f) return result;
        s = Math.max(0f, Math.min(trajectoryTotalM, s));
        int lo = 0;
        int hi = trajectoryCum.length - 1;
        while (lo < hi - 1) {
            int mid = (lo + hi) / 2;
            if (trajectoryCum[mid] <= s) lo = mid;
            else hi = mid;
        }
        float s0 = trajectoryCum[lo];
        float s1 = trajectoryCum[Math.min(lo + 1, trajectoryCum.length - 1)];
        float u = s1 > s0 ? (s - s0) / (s1 - s0) : 0f;
        PointF a = trajectory.get(lo);
        PointF b = trajectory.get(Math.min(lo + 1, trajectory.size() - 1));
        result.x = a.x + u * (b.x - a.x);
        result.y = a.y + u * (b.y - a.y);

        float eps = Math.min(0.0040f, Math.max(0.0015f, trajectoryTotalM * 0.02f));
        PointF p0 = positionAtDistance(Math.max(0f, s - eps));
        PointF p1 = positionAtDistance(Math.min(trajectoryTotalM, s + eps));
        float dx = p1.x - p0.x;
        float dy = p1.y - p0.y;
        float len = (float) Math.hypot(dx, dy);
        if (len > 1e-6f) {
            result.tx = dx / len;
            result.ty = dy / len;
        } else {
            float segLen = (float) Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen > 1e-6f) {
                result.tx = (b.x - a.x) / segLen;
                result.ty = (b.y - a.y) / segLen;
            }
        }
        return result;
    }

    private PointF positionAtDistance(float s) {
        if (trajectory.size() < 2) return new PointF();
        s = Math.max(0f, Math.min(trajectoryTotalM, s));
        int i = 0;
        while (i < trajectoryCum.length - 2 && trajectoryCum[i + 1] < s) i++;
        float s0 = trajectoryCum[i];
        float s1 = trajectoryCum[i + 1];
        float u = s1 > s0 ? (s - s0) / (s1 - s0) : 0f;
        PointF a = trajectory.get(i);
        PointF b = trajectory.get(i + 1);
        return new PointF(a.x + u * (b.x - a.x), a.y + u * (b.y - a.y));
    }

    private void startTrajectoryMotion() {
        if (!trajectoryReady) return;
        if (trajectoryFinished) trajectoryS = 0f;
        trajectoryFinished = false;
        trajectoryRunning = true;
        firstTrajectoryVelocity = true;
        trajectoryAx = trajectoryAy = 0f;
        MotionSample s = sampleTrajectory(trajectoryS);
        trajectoryX = s.x;
        trajectoryY = s.y;
        trajectoryVx = s.tx * initialSpeed;
        trajectoryVy = s.ty * initialSpeed;
        previousTrajectoryVx = trajectoryVx;
        previousTrajectoryVy = trajectoryVy;
    }

    private void advanceTrajectory(float dt) {
        if (!trajectoryRunning || !trajectoryReady) return;
        trajectoryS += initialSpeed * dt;
        if (trajectoryS >= trajectoryTotalM) {
            trajectoryS = trajectoryTotalM;
            trajectoryRunning = false;
            trajectoryFinished = true;
        }

        MotionSample s = sampleTrajectory(trajectoryS);
        trajectoryX = s.x;
        trajectoryY = s.y;
        float newVx = s.tx * initialSpeed;
        float newVy = s.ty * initialSpeed;

        if (firstTrajectoryVelocity) {
            firstTrajectoryVelocity = false;
            trajectoryAx = trajectoryAy = 0f;
        } else {
            float rawAx = (newVx - previousTrajectoryVx) / Math.max(dt, 0.001f);
            float rawAy = (newVy - previousTrajectoryVy) / Math.max(dt, 0.001f);
            float alpha = 1f - (float) Math.exp(-dt / 0.075f);
            trajectoryAx += alpha * (rawAx - trajectoryAx);
            trajectoryAy += alpha * (rawAy - trajectoryAy);
        }
        trajectoryVx = newVx;
        trajectoryVy = newVy;
        previousTrajectoryVx = newVx;
        previousTrajectoryVy = newVy;

        if (trajectoryFinished) {
            trajectoryVx = trajectoryVy = 0f;
            trajectoryAx = trajectoryAy = 0f;
        }
    }

    private float trajectoryTimeScale() {
        return TRAJECTORY_TIME_SCALES[Math.max(0, Math.min(TRAJECTORY_TIME_SCALES.length - 1, trajectoryTimeScaleIndex))];
    }

    private String trajectoryTimeScaleLabel() {
        switch (trajectoryTimeScaleIndex) {
            case 1: return "1/2×";
            case 2: return "1/4×";
            case 3: return "1/8×";
            default: return "1×";
        }
    }

    private void drawMode2(Canvas canvas, float dt) {
        // A câmara lenta altera apenas o avanço temporal da animação.
        // v e a continuam a ser calculadas e apresentadas em unidades físicas reais.
        advanceTrajectory(dt * trajectoryTimeScale());
        drawGrid(canvas, trajectoryControlsTopPx());
        drawTrajectoryCurve(canvas);
        if (trajectoryReady) {
            drawBall(canvas, trajectoryX, trajectoryY, trajectoryS);
            drawVectorSet(canvas, trajectoryX, trajectoryY,
                    trajectoryVx, trajectoryVy, trajectoryAx, trajectoryAy,
                    1900f * density, 2400f * density,
                    Math.min(getWidth() * 0.82f, 330f * density), showComponents);
        }
        drawHudMode2(canvas);
        drawTrajectoryControls(canvas);
        drawSmallMenuButton(canvas, 16f * density);
    }

    private void drawTrajectoryCurve(Canvas canvas) {
        if (trajectory.size() < 2) {
            textPaint.setTextAlign(Paint.Align.CENTER);
            textPaint.setColor(Color.rgb(105, 114, 127));
            textPaint.setTextSize(15f * density);
            canvas.drawText("Desenhe uma trajetória com o dedo", getWidth() * 0.5f,
                    (trajectoryHudBottomPx() + trajectoryControlsTopPx()) * 0.5f, textPaint);
            textPaint.setTextSize(12f * density);
            canvas.drawText("Pode ser reta, curva, circular ou irregular", getWidth() * 0.5f,
                    (trajectoryHudBottomPx() + trajectoryControlsTopPx()) * 0.5f + 24f * density, textPaint);
            textPaint.setTextAlign(Paint.Align.LEFT);
            return;
        }
        path.reset();
        path.moveTo(px(trajectory.get(0).x), px(trajectory.get(0).y));
        for (int i = 1; i < trajectory.size(); i++) path.lineTo(px(trajectory.get(i).x), px(trajectory.get(i).y));
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(5f * density);
        paint.setColor(Color.argb(45, 76, 83, 98));
        canvas.drawPath(path, paint);
        paint.setStrokeWidth(1.8f * density);
        paint.setColor(Color.rgb(102, 91, 130));
        canvas.drawPath(path, paint);

        PointF start = trajectory.get(0);
        PointF end = trajectory.get(trajectory.size() - 1);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(45, 145, 85));
        canvas.drawCircle(px(start.x), px(start.y), 5f * density, paint);
        paint.setColor(Color.rgb(205, 120, 35));
        canvas.drawCircle(px(end.x), px(end.y), 5f * density, paint);
    }

    private void drawHudMode2(Canvas canvas) {
        float pad = 12f * density;
        float top = 10f * density;
        float bottom = trajectoryHudBottomPx() - 6f * density;
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(226, 255, 255, 255));
        canvas.drawRoundRect(new RectF(pad, top, getWidth() - pad, bottom), 14f * density, 14f * density, paint);
        textPaint.setColor(Color.rgb(25, 30, 42));
        textPaint.setTextSize(18f * density);
        textPaint.setFakeBoldText(true);
        canvas.drawText("Trajetória desenhada", pad + 12f * density, top + 25f * density, textPaint);
        textPaint.setFakeBoldText(false);
        textPaint.setTextSize(11.5f * density);
        textPaint.setColor(Color.rgb(80, 88, 100));
        canvas.drawText("Trilho ideal: rapidez constante = v₀; a resulta da mudança de direção", pad + 12f * density, top + 45f * density, textPaint);
        textPaint.setTextSize(14f * density);
        textPaint.setColor(Color.rgb(22, 92, 210));
        canvas.drawText(String.format(Locale.US, "v = %.2f m/s   (vx %.2f | vy %.2f)",
                Math.hypot(trajectoryVx, trajectoryVy), trajectoryVx, trajectoryVy), pad + 12f * density, top + 70f * density, textPaint);
        textPaint.setColor(Color.rgb(220, 55, 55));
        canvas.drawText(String.format(Locale.US, "a = %.2f m/s²  (ax %.2f | ay %.2f)",
                Math.hypot(trajectoryAx, trajectoryAy), trajectoryAx, trajectoryAy), pad + 12f * density, top + 92f * density, textPaint);
        textPaint.setColor(Color.rgb(80, 88, 100));
        textPaint.setTextSize(11f * density);
        String state = trajectoryDrawing ? "a desenhar" : trajectoryRunning ? "em movimento" : trajectoryFinished ? "fim" : trajectoryReady ? "pronta" : "sem trajetória";
        canvas.drawText(String.format(Locale.US, "v₀ = %.2f m/s • traj. %.2f m • reprodução %s • %s",
                initialSpeed, trajectoryTotalM, trajectoryTimeScaleLabel(), state),
                pad + 12f * density, top + 114f * density, textPaint);
    }

    private void drawTrajectoryControls(Canvas canvas) {
        float margin = 8f * density;
        float panelTop = trajectoryControlsTopPx();
        float panelBottom = trajectoryButtonsTopPx() - 7f * density;
        RectF panel = new RectF(margin, panelTop, getWidth() - margin, panelBottom);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(235, 255, 255, 255));
        canvas.drawRoundRect(panel, 12f * density, 12f * density, paint);

        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setColor(Color.rgb(45, 52, 66));
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(11.5f * density);
        canvas.drawText(String.format(Locale.US, "Velocidade inicial v₀  %.2f m/s", initialSpeed), panel.left + 12f * density, panel.top + 19f * density, textPaint);
        textPaint.setFakeBoldText(false);
        float left = panel.left + 14f * density;
        float right = panel.right - 14f * density;
        float y = panel.bottom - 14f * density;
        speedSlider.set(left, y - 13f * density, right, y + 13f * density);
        float normalized = (initialSpeed - TRAJECTORY_SPEED_MIN) / (TRAJECTORY_SPEED_MAX - TRAJECTORY_SPEED_MIN);
        drawSlider(canvas, left, right, y, normalized, Color.rgb(105, 72, 138));

        String[] labels = {
                "Nova trajetória",
                trajectoryRunning ? "Pausa" : (trajectoryReady ? "Executar" : "Executar"),
                showComponents ? "Componentes ✓" : "Componentes",
                "Slow " + trajectoryTimeScaleLabel()
        };
        float gap = 6f * density;
        float h = 40f * density;
        float totalW = getWidth() - 2f * margin;
        float w = (totalW - gap) / 2f;
        float y2 = getHeight() - systemBottomInsetPx - margin - h;
        float y1 = y2 - gap - h;
        for (int i = 0; i < 4; i++) {
            int col = i % 2;
            int row = i / 2;
            float x = margin + col * (w + gap);
            float top = row == 0 ? y1 : y2;
            trajectoryButtons[i].set(x, top, x + w, top + h);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(i == 1 ? Color.rgb(86, 66, 126) : Color.rgb(35, 44, 62));
            canvas.drawRoundRect(trajectoryButtons[i], 10f * density, 10f * density, paint);
            textPaint.setTextAlign(Paint.Align.CENTER);
            textPaint.setColor(Color.WHITE);
            textPaint.setTextSize(11.5f * density);
            textPaint.setFakeBoldText(i == 1);
            canvas.drawText(labels[i], trajectoryButtons[i].centerX(), trajectoryButtons[i].centerY() + 4f * density, textPaint);
            textPaint.setFakeBoldText(false);
        }
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    // ---------------------------------------------------------------------
    // DESENHO COMUM: esfera e vetores
    // ---------------------------------------------------------------------

    private void drawBall(Canvas canvas, float xM, float yM, float rollDistance) {
        float cx = px(xM);
        float cy = px(yM);
        float r = px(radiusM);
        paint.setShader(new RadialGradient(cx - r * 0.35f, cy - r * 0.40f, r * 1.35f,
                new int[]{Color.WHITE, Color.rgb(90, 130, 225), Color.rgb(28, 50, 105)},
                new float[]{0f, 0.48f, 1f}, Shader.TileMode.CLAMP));
        paint.setStyle(Paint.Style.FILL);
        canvas.drawCircle(cx, cy, r, paint);
        paint.setShader(null);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.5f * density);
        paint.setColor(Color.rgb(25, 40, 85));
        canvas.drawCircle(cx, cy, r, paint);

        float rollAngle = radiusM > 0f ? rollDistance / radiusM : 0f;
        float dx = (float) Math.cos(rollAngle) * r * 0.78f;
        float dy = (float) Math.sin(rollAngle) * r * 0.78f;
        canvas.save();
        path.reset();
        path.addCircle(cx, cy, r * 0.94f, Path.Direction.CW);
        canvas.clipPath(path);
        paint.setStrokeWidth(1.7f * density);
        paint.setColor(Color.argb(180, 255, 255, 255));
        canvas.drawLine(cx - dx, cy - dy, cx + dx, cy + dy, paint);
        canvas.restore();
    }

    private void drawImpactHalo(Canvas canvas, float xM, float yM, boolean strong) {
        float cx = px(xM);
        float cy = px(yM);
        float r = px(radiusM) + 7f * density;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.7f * density);
        paint.setColor(strong ? Color.argb(185, 230, 105, 35) : Color.argb(160, 235, 125, 25));
        canvas.drawCircle(cx, cy, r, paint);
    }

    private void drawVectorSet(Canvas canvas, float xM, float yM,
                               float vx, float vy, float ax, float ay,
                               float velocityScale, float accelerationScale,
                               float maxLength, boolean components) {
        drawVectorWithComponents(canvas, px(xM), px(yM), vx, vy,
                velocityScale, maxLength, Color.rgb(22, 92, 210), "v", components);
        drawVectorWithComponents(canvas, px(xM), px(yM), ax, ay,
                accelerationScale, maxLength, Color.rgb(220, 55, 55), "a", components);
    }

    private void drawVectorWithComponents(Canvas canvas, float cx, float cy,
                                          float xValue, float yValue, float scale,
                                          float maxLength, int color, String label,
                                          boolean components) {
        float dx = xValue * scale;
        float dy = yValue * scale;
        float length = (float) Math.hypot(dx, dy);
        if (length < 0.8f * density) return;
        float factor = length > maxLength ? maxLength / length : 1f;
        dx *= factor;
        dy *= factor;

        if (components) {
            int componentColor = Color.argb(150, Color.red(color), Color.green(color), Color.blue(color));
            drawThinArrow(canvas, cx, cy, dx, 0f, componentColor, label + "x");
            drawThinArrow(canvas, cx + dx, cy, 0f, dy, componentColor, label + "y");
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1f * density);
            paint.setColor(Color.argb(65, Color.red(color), Color.green(color), Color.blue(color)));
            canvas.drawLine(cx, cy + dy, cx + dx, cy + dy, paint);
            canvas.drawLine(cx, cy, cx, cy + dy, paint);
        }
        drawArrow(canvas, cx, cy, dx, dy, color, label);
    }

    private void drawThinArrow(Canvas canvas, float x1, float y1, float dx, float dy, int color, String label) {
        float length = (float) Math.hypot(dx, dy);
        if (length < 5f * density) return;
        float x2 = x1 + dx;
        float y2 = y1 + dy;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(1.6f * density);
        paint.setColor(color);
        canvas.drawLine(x1, y1, x2, y2, paint);
        textPaint.setColor(color);
        textPaint.setTextSize(10f * density);
        canvas.drawText(label, x2 + 4f * density, y2 - 3f * density, textPaint);
    }

    private void drawArrow(Canvas canvas, float x1, float y1, float dx, float dy, int color, String label) {
        float length = (float) Math.hypot(dx, dy);
        if (length < 0.8f * density) return;
        float x2 = x1 + dx;
        float y2 = y1 + dy;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(2.6f * density);
        paint.setColor(color);
        canvas.drawLine(x1, y1, x2, y2, paint);
        float ux = dx / length;
        float uy = dy / length;
        float head = 11f * density;
        float wing = 5.5f * density;
        float bx = x2 - ux * head;
        float by = y2 - uy * head;
        float perpX = -uy;
        float perpY = ux;
        path.reset();
        path.moveTo(x2, y2);
        path.lineTo(bx + perpX * wing, by + perpY * wing);
        path.moveTo(x2, y2);
        path.lineTo(bx - perpX * wing, by - perpY * wing);
        canvas.drawPath(path, paint);
        textPaint.setColor(color);
        textPaint.setTextSize(15f * density);
        textPaint.setFakeBoldText(false);
        canvas.drawText(label, x2 + 5f * density, y2 - 5f * density, textPaint);
    }

    // ---------------------------------------------------------------------
    // CICLO E TOQUE
    // ---------------------------------------------------------------------

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (appMode == APP_MENU) {
            drawStartMenu(canvas);
            return;
        }

        long nowNanos = System.nanoTime();
        float dt = lastFrameNanos == 0L ? 1f / 60f : (nowNanos - lastFrameNanos) / 1_000_000_000f;
        lastFrameNanos = nowNanos;
        dt = Math.min(Math.max(dt, 1f / 240f), 0.035f);
        long nowMs = SystemClock.elapsedRealtime();

        if (appMode == APP_MODE_1) drawMode1(canvas, dt, nowMs);
        else drawMode2(canvas, dt);
        postInvalidateOnAnimation();
    }

    private float valueFromSliderX(RectF slider, float x) {
        float left = slider.left;
        float right = slider.right;
        if (right <= left) return 0f;
        return Math.max(0f, Math.min(1f, (x - left) / (right - left)));
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX();
        float y = event.getY();

        if (appMode == APP_MENU) {
            if (event.getAction() == MotionEvent.ACTION_UP) {
                if (menuMode1.contains(x, y)) {
                    appMode = APP_MODE_1;
                    calibratePlane(false);
                    resetSimulation();
                } else if (menuMode2.contains(x, y)) {
                    appMode = APP_MODE_2;
                    clearTrajectory();
                    lastFrameNanos = 0L;
                }
                performClick();
            }
            return true;
        }

        if (menuButton.contains(x, y) && event.getAction() == MotionEvent.ACTION_UP) {
            appMode = APP_MENU;
            trajectoryRunning = false;
            performClick();
            invalidate();
            return true;
        }

        if (appMode == APP_MODE_1) return handleMode1Touch(event, x, y);
        return handleMode2Touch(event, x, y);
    }

    private boolean handleMode1Touch(MotionEvent event, float x, float y) {
        if (event.getAction() == MotionEvent.ACTION_DOWN) {
            if (massSlider.contains(x, y)) {
                draggingMass = true;
                massSetting = valueFromSliderX(massSlider, x);
                return true;
            }
            return true;
        }
        if (event.getAction() == MotionEvent.ACTION_MOVE) {
            if (draggingMass) {
                massSetting = valueFromSliderX(massSlider, x);
                invalidate();
            }
            return true;
        }
        if (event.getAction() == MotionEvent.ACTION_UP) {
            if (draggingMass) {
                massSetting = valueFromSliderX(massSlider, x);
                draggingMass = false;
                performClick();
                return true;
            }
            if (frictionToggle.contains(x, y)) {
                physics.frictionEnabled = !physics.frictionEnabled;
                performClick();
                invalidate();
                return true;
            }
            for (int i = 0; i < buttons.length; i++) {
                if (buttons[i].contains(x, y)) {
                    handleMode1Button(i);
                    performClick();
                    return true;
                }
            }
        }
        if (event.getAction() == MotionEvent.ACTION_CANCEL) draggingMass = false;
        return true;
    }

    private void handleMode1Button(int index) {
        switch (index) {
            case 0: resetSimulation(); break;
            case 1: calibratePlane(true); break;
            case 2: physics.realSphere = !physics.realSphere; resetSimulation(); break;
            case 3: mode = (mode + 1) % 6; resetSimulation(); break;
            case 4: showVectors = !showVectors; invalidate(); break;
            case 5:
                showTrail = !showTrail;
                if (!showTrail) trail.clear();
                invalidate();
                break;
            default: break;
        }
    }

    private boolean handleMode2Touch(MotionEvent event, float x, float y) {
        if (event.getAction() == MotionEvent.ACTION_DOWN) {
            if (speedSlider.contains(x, y)) {
                draggingSpeed = true;
                setInitialSpeedFromX(x);
                return true;
            }
            for (RectF b : trajectoryButtons) if (b.contains(x, y)) return true;
            if (inTrajectoryDrawingArea(y)) {
                trajectoryRunning = false;
                beginTrajectory(x, y);
                return true;
            }
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_MOVE) {
            if (draggingSpeed) {
                setInitialSpeedFromX(x);
                return true;
            }
            if (trajectoryDrawing && inTrajectoryDrawingArea(y)) appendTrajectory(x, y);
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_UP) {
            if (draggingSpeed) {
                setInitialSpeedFromX(x);
                draggingSpeed = false;
                performClick();
                return true;
            }
            if (trajectoryDrawing) {
                if (inTrajectoryDrawingArea(y)) appendTrajectory(x, y);
                finishTrajectoryDrawing();
                performClick();
                return true;
            }
            for (int i = 0; i < trajectoryButtons.length; i++) {
                if (trajectoryButtons[i].contains(x, y)) {
                    handleTrajectoryButton(i);
                    performClick();
                    return true;
                }
            }
        }

        if (event.getAction() == MotionEvent.ACTION_CANCEL) {
            draggingSpeed = false;
            if (trajectoryDrawing) finishTrajectoryDrawing();
        }
        return true;
    }

    private void setInitialSpeedFromX(float x) {
        float n = valueFromSliderX(speedSlider, x);
        initialSpeed = TRAJECTORY_SPEED_MIN + n * (TRAJECTORY_SPEED_MAX - TRAJECTORY_SPEED_MIN);
        invalidate();
    }

    private void handleTrajectoryButton(int index) {
        switch (index) {
            case 0:
                clearTrajectory();
                break;
            case 1:
                if (!trajectoryReady) return;
                if (trajectoryRunning) trajectoryRunning = false;
                else startTrajectoryMotion();
                break;
            case 2:
                showComponents = !showComponents;
                invalidate();
                break;
            case 3:
                trajectoryTimeScaleIndex = (trajectoryTimeScaleIndex + 1) % TRAJECTORY_TIME_SCALES.length;
                invalidate();
                break;
            default:
                break;
        }
    }

    @Override
    public boolean performClick() {
        super.performClick();
        return true;
    }
}
