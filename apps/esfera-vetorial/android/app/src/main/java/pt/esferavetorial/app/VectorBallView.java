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
import java.util.Locale;

public final class VectorBallView extends View {
    private final BallPhysics physics = new BallPhysics();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final ArrayDeque<PointF> trail = new ArrayDeque<>();
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
            {
                    {0.16f, 0.84f}, {0.42f, 0.78f}, {0.28f, 0.65f},
                    {0.69f, 0.60f}, {0.78f, 0.46f}, {0.50f, 0.41f},
                    {0.25f, 0.32f}, {0.55f, 0.24f}, {0.79f, 0.15f}
            }
    };

    private static final float[] TRACK_HALF_WIDTHS_M = {0.0105f, 0.0095f, 0.0088f};

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

    private final float targetXFraction = 0.75f;
    private final float targetYFraction = 0.46f;
    private final float targetRadiusM = 0.018f;

    private final float density;

    private static final class NearestPoint {
        float x;
        float y;
        float distance;
    }

    public VectorBallView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        textPaint.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.NORMAL));
        setBackgroundColor(Color.rgb(247, 249, 252));
        setFocusable(true);
        for (int i = 0; i < buttons.length; i++) buttons[i] = new RectF();
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
            if (getWidth() > 0 && getHeight() > 0) resetSimulation();
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
        resetSimulation();
    }

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
        invalidate();
    }

    private void calibratePlane(boolean reset) {
        zeroX = sensorX;
        zeroY = sensorY;
        controlGravityX = controlGravityY = 0f;
        calibrated = true;
        if (reset) resetSimulation();
    }

    private float px(float meters) {
        return meters * pixelsPerMeter;
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

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        long nowNanos = System.nanoTime();
        float dt;
        if (lastFrameNanos == 0L) {
            dt = 1f / 60f;
        } else {
            dt = (nowNanos - lastFrameNanos) / 1_000_000_000f;
        }
        lastFrameNanos = nowNanos;
        dt = Math.min(Math.max(dt, 1f / 240f), 0.035f);

        float rawGravityX = -(sensorX - zeroX);
        float rawGravityY = (sensorY - zeroY);
        float requestedX = CONTROL_GAIN * deadZone(rawGravityX);
        float requestedY = CONTROL_GAIN * deadZone(rawGravityY);
        float smoothing = 1f - (float) Math.exp(-dt / controlTauSeconds());
        controlGravityX += smoothing * (requestedX - controlGravityX);
        controlGravityY += smoothing * (requestedY - controlGravityY);

        physics.update(dt, controlGravityX, controlGravityY,
                widthM, playableHeightM(), radiusM);

        long nowMs = SystemClock.elapsedRealtime();
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

        drawGrid(canvas);
        if (isTrackMode()) {
            drawTrack(canvas);
        } else if (mode != 0) {
            drawTarget(canvas);
        }
        if (showTrail) drawTrail(canvas);
        drawBall(canvas);
        if (nowMs < impactVisibleUntilMs) drawImpactHalo(canvas);
        if (showVectors) drawVectors(canvas);
        drawHud(canvas, controlGravityX, controlGravityY, nowMs);
        drawParameterPanel(canvas);
        drawButtons(canvas);
        if (success) drawSuccess(canvas, nowMs);

        postInvalidateOnAnimation();
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
        } else {
            targetStableSinceMs = 0L;
        }
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
            }
        }
        return result;
    }

    private void constrainToTrack(long nowMs) {
        int t = trackIndex();
        NearestPoint nearest = nearestPointOnTrack(t, physics.x, physics.y);
        float allowed = Math.max(0.0015f, TRACK_HALF_WIDTHS_M[t] - radiusM);
        if (nearest.distance <= allowed) return;

        float nx;
        float ny;
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
            if (toFinish < 0.0080f) {
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

    private void drawGrid(Canvas canvas) {
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1f);
        paint.setColor(Color.rgb(224, 229, 236));
        float step = px(0.02f);
        for (float x = step; x < getWidth(); x += step) canvas.drawLine(x, 0, x, getHeight(), paint);
        for (float y = step; y < getHeight(); y += step) canvas.drawLine(0, y, getWidth(), y, paint);

        paint.setColor(Color.rgb(185, 193, 204));
        paint.setStrokeWidth(2f * density);
        float y = controlsTopPx() - 22f * density;
        float x1 = 16f * density;
        float x2 = x1 + px(0.02f);
        canvas.drawLine(x1, y, x2, y, paint);
        canvas.drawLine(x1, y - 4f * density, x1, y + 4f * density, paint);
        canvas.drawLine(x2, y - 4f * density, x2, y + 4f * density, paint);
        textPaint.setColor(Color.rgb(100, 108, 120));
        textPaint.setTextSize(11f * density);
        canvas.drawText("2 cm (escala aproximada)", x1, y - 7f * density, textPaint);
    }

    private void drawTarget(Canvas canvas) {
        float tx = px(widthM * targetXFraction);
        float ty = px(playableHeightM() * targetYFraction);
        float tr = px(targetRadiusM);

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(40, 30, 160, 80));
        canvas.drawCircle(tx, ty, tr, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(3f * density);
        paint.setColor(Color.rgb(30, 150, 80));
        canvas.drawCircle(tx, ty, tr, paint);
        paint.setStrokeWidth(1.5f * density);
        canvas.drawCircle(tx, ty, tr * 0.50f, paint);
    }

    private void buildTrackPath(int t) {
        path.reset();
        path.moveTo(px(trackX(t, 0)), px(trackY(t, 0)));
        for (int i = 1; i < TRACKS[t].length; i++) {
            path.lineTo(px(trackX(t, i)), px(trackY(t, i)));
        }
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
        canvas.drawCircle(finishX, finishY, px(0.0080f), paint);

        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(10f * density);
        textPaint.setColor(Color.rgb(30, 105, 65));
        canvas.drawText("PARTIDA", startX, startY - px(0.010f), textPaint);
        textPaint.setColor(Color.rgb(150, 95, 15));
        canvas.drawText("META", finishX, finishY - px(0.010f), textPaint);
        textPaint.setFakeBoldText(false);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawTrail(Canvas canvas) {
        if (trail.size() < 2) return;
        path.reset();
        boolean first = true;
        for (PointF point : trail) {
            if (first) {
                path.moveTo(point.x, point.y);
                first = false;
            } else {
                path.lineTo(point.x, point.y);
            }
        }
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.4f * density);
        paint.setColor(Color.argb(110, 80, 90, 110));
        canvas.drawPath(path, paint);
    }

    private void drawBall(Canvas canvas) {
        float cx = px(physics.x);
        float cy = px(physics.y);
        float r = px(radiusM);

        paint.setShader(new RadialGradient(cx - r * 0.35f, cy - r * 0.40f,
                r * 1.35f,
                new int[]{Color.WHITE, Color.rgb(90, 130, 225), Color.rgb(28, 50, 105)},
                new float[]{0f, 0.48f, 1f}, Shader.TileMode.CLAMP));
        paint.setStyle(Paint.Style.FILL);
        canvas.drawCircle(cx, cy, r, paint);
        paint.setShader(null);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.5f * density);
        paint.setColor(Color.rgb(25, 40, 85));
        canvas.drawCircle(cx, cy, r, paint);

        float rollAngle = radiusM > 0f ? physics.distance / radiusM : 0f;
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

    private void drawImpactHalo(Canvas canvas) {
        float cx = px(physics.x);
        float cy = px(physics.y);
        float r = px(radiusM) + 7f * density;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.7f * density);
        paint.setColor(trackWallContact
                ? Color.argb(185, 230, 105, 35)
                : Color.argb(160, 235, 125, 25));
        canvas.drawCircle(cx, cy, r, paint);
    }

    private void drawVectors(Canvas canvas) {
        float cx = px(physics.x);
        float cy = px(physics.y);

        float velocityScale = 1950f * density;
        float accelerationScale = 1180f * density;
        float maxLength = Math.min(getWidth() * 1.05f, 380f * density);

        drawArrow(canvas, cx, cy,
                physics.vx * velocityScale,
                physics.vy * velocityScale,
                maxLength, Color.rgb(22, 92, 210), "v");

        drawArrow(canvas, cx, cy,
                shownAx * accelerationScale,
                shownAy * accelerationScale,
                maxLength, Color.rgb(220, 55, 55), "a");
    }

    private void drawArrow(Canvas canvas, float x1, float y1,
                           float dx, float dy, float maxLength,
                           int color, String label) {
        float length = (float) Math.hypot(dx, dy);
        if (length < 0.8f * density) return;
        if (length > maxLength) {
            float factor = maxLength / length;
            dx *= factor;
            dy *= factor;
            length = maxLength;
        }
        float x2 = x1 + dx;
        float y2 = y1 + dy;

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(3.0f * density);
        paint.setColor(color);
        canvas.drawLine(x1, y1, x2, y2, paint);

        float ux = dx / length;
        float uy = dy / length;
        float head = 12f * density;
        float wing = 6f * density;
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
        textPaint.setTextSize(16f * density);
        textPaint.setFakeBoldText(false);
        canvas.drawText(label, x2 + 6f * density, y2 - 5f * density, textPaint);
    }

    private String modeName() {
        switch (mode) {
            case 0: return "Exploração";
            case 1: return "Parar no alvo";
            case 2: return "Alvo: v máx. 0,40 m/s";
            case 3: return "Pista 1";
            case 4: return "Pista 2";
            case 5: return "Pista 3";
            default: return "Exploração";
        }
    }

    private void drawHud(Canvas canvas, float effectiveGravityX, float effectiveGravityY, long nowMs) {
        float pad = 12f * density;
        float boxTop = 10f * density;
        float boxHeight = isTrackMode() ? 137f * density : 118f * density;
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(220, 255, 255, 255));
        canvas.drawRoundRect(new RectF(pad, boxTop, getWidth() - pad, boxTop + boxHeight),
                14f * density, 14f * density, paint);

        textPaint.setColor(Color.rgb(25, 30, 42));
        textPaint.setTextSize(18f * density);
        textPaint.setFakeBoldText(true);
        canvas.drawText("Esfera Vetorial", pad + 12f * density, boxTop + 25f * density, textPaint);
        textPaint.setFakeBoldText(false);

        textPaint.setTextSize(13f * density);
        String model = physics.realSphere ? "esfera maciça (5/7)" : "modelo ideal (1)";
        canvas.drawText("Modo: " + modeName() + "   •   Modelo: " + model,
                pad + 12f * density, boxTop + 47f * density, textPaint);

        textPaint.setTextSize(14f * density);
        textPaint.setColor(Color.rgb(22, 92, 210));
        canvas.drawText(String.format(Locale.US, "v = %.2f m/s   (vx %.2f | vy %.2f)",
                        physics.speed(), physics.vx, physics.vy),
                pad + 12f * density, boxTop + 70f * density, textPaint);
        textPaint.setColor(Color.rgb(220, 55, 55));
        canvas.drawText(String.format(Locale.US, "a = %.2f m/s²  (ax %.2f | ay %.2f)",
                        Math.hypot(shownAx, shownAy), shownAx, shownAy),
                pad + 12f * density, boxTop + 92f * density, textPaint);

        textPaint.setColor(Color.rgb(80, 88, 100));
        textPaint.setTextSize(11f * density);
        String sensor = !sensorAvailable ? "Sensor indisponível"
                : (accelerometerFallback ? "Acelerómetro filtrado" : "Sensor de gravidade");
        canvas.drawText(String.format(Locale.US, "%s • g∥=(%.2f, %.2f) • percurso %.2f m",
                        sensor, effectiveGravityX, effectiveGravityY, physics.distance),
                pad + 12f * density, boxTop + 111f * density, textPaint);

        if (isTrackMode()) {
            textPaint.setFakeBoldText(true);
            textPaint.setTextSize(11.5f * density);
            textPaint.setColor(Color.rgb(95, 63, 20));
            String timer;
            if (!trackStarted) {
                timer = "Saia da PARTIDA para iniciar o cronómetro";
            } else {
                timer = String.format(Locale.US,
                        "Tempo %.2f s + penal. %.0f s = %.2f s   •   toques %d",
                        trackRawSeconds(nowMs), trackPenaltySeconds, trackTotalSeconds(nowMs), trackHits);
            }
            canvas.drawText(timer, pad + 12f * density, boxTop + 130f * density, textPaint);
            textPaint.setFakeBoldText(false);
        }
    }

    private void drawParameterPanel(Canvas canvas) {
        float margin = 8f * density;
        float top = controlsTopPx();
        float bottom = buttonRowsTopPx() - 7f * density;
        RectF panel = new RectF(margin, top, getWidth() - margin, bottom);

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(232, 255, 255, 255));
        canvas.drawRoundRect(panel, 12f * density, 12f * density, paint);

        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setTextSize(11.5f * density);
        textPaint.setColor(Color.rgb(45, 52, 66));
        textPaint.setFakeBoldText(true);
        canvas.drawText(String.format(Locale.US, "Massa  %d%%", Math.round(massSetting * 100f)),
                panel.left + 12f * density, panel.top + 19f * density, textPaint);
        textPaint.setFakeBoldText(false);

        float toggleW = 86f * density;
        float toggleH = 27f * density;
        frictionToggle.set(panel.right - toggleW - 8f * density,
                panel.top + 6f * density,
                panel.right - 8f * density,
                panel.top + 6f * density + toggleH);
        paint.setColor(physics.frictionEnabled ? Color.rgb(43, 125, 80) : Color.rgb(95, 103, 118));
        canvas.drawRoundRect(frictionToggle, 10f * density, 10f * density, paint);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setTextSize(11f * density);
        textPaint.setColor(Color.WHITE);
        textPaint.setFakeBoldText(true);
        canvas.drawText(physics.frictionEnabled ? "Atrito ON" : "Atrito OFF",
                frictionToggle.centerX(), frictionToggle.centerY() + 4f * density, textPaint);
        textPaint.setFakeBoldText(false);

        float sliderLeft = panel.left + 14f * density;
        float sliderRight = panel.right - 14f * density;
        float sliderY = panel.bottom - 14f * density;
        massSlider.set(sliderLeft, sliderY - 13f * density,
                sliderRight, sliderY + 13f * density);
        drawSlider(canvas, sliderLeft, sliderRight, sliderY, massSetting,
                Color.rgb(55, 77, 126));

        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawSlider(Canvas canvas, float left, float right, float y,
                            float value, int knobColor) {
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

    private String modeButtonLabel() {
        switch (mode) {
            case 0: return "Explorar";
            case 1: return "Alvo";
            case 2: return "Alvo ≤0,40";
            case 3: return "Pista 1";
            case 4: return "Pista 2";
            case 5: return "Pista 3";
            default: return "Explorar";
        }
    }

    private void drawButtons(Canvas canvas) {
        String[] labels = {
                "Reiniciar", "Calibrar", physics.realSphere ? "Esfera real" : "Ideal",
                modeButtonLabel(), showVectors ? "Vetores ✓" : "Vetores", showTrail ? "Rasto ✓" : "Rasto"
        };
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
        RectF box = new RectF(cx - 135f * density, cy - 58f * density,
                cx + 135f * density, cy + 58f * density);
        canvas.drawRoundRect(box, 18f * density, 18f * density, paint);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setColor(Color.WHITE);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(21f * density);
        canvas.drawText(isTrackMode() ? "Pista concluída" : "Objetivo atingido",
                cx, cy - 20f * density, textPaint);

        if (isTrackMode()) {
            textPaint.setTextSize(15f * density);
            canvas.drawText(String.format(Locale.US, "Tempo final: %.2f s", trackTotalSeconds(nowMs)),
                    cx, cy + 5f * density, textPaint);
            textPaint.setTextSize(13f * density);
            canvas.drawText(String.format(Locale.US, "%d toques • %.0f s de penalização",
                            trackHits, trackPenaltySeconds),
                    cx, cy + 28f * density, textPaint);
        } else {
            textPaint.setTextSize(16f * density);
            canvas.drawText("Pontuação: " + score, cx, cy + 15f * density, textPaint);
        }
        textPaint.setFakeBoldText(false);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private float valueFromSliderX(RectF slider, float x) {
        float left = slider.left;
        float right = slider.right;
        if (right <= left) return 0f;
        return Math.max(0f, Math.min(1f, (x - left) / (right - left)));
    }

    private void setMassFromX(float x) {
        massSetting = valueFromSliderX(massSlider, x);
        invalidate();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX();
        float y = event.getY();

        if (event.getAction() == MotionEvent.ACTION_DOWN) {
            if (massSlider.contains(x, y)) {
                draggingMass = true;
                setMassFromX(x);
                return true;
            }
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_MOVE) {
            if (draggingMass) {
                setMassFromX(x);
                return true;
            }
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_UP) {
            if (draggingMass) {
                setMassFromX(x);
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
                    handleButton(i);
                    performClick();
                    return true;
                }
            }
        }

        if (event.getAction() == MotionEvent.ACTION_CANCEL) {
            draggingMass = false;
        }
        return true;
    }

    private void handleButton(int index) {
        switch (index) {
            case 0:
                resetSimulation();
                break;
            case 1:
                calibratePlane(true);
                break;
            case 2:
                physics.realSphere = !physics.realSphere;
                resetSimulation();
                break;
            case 3:
                mode = (mode + 1) % 6;
                resetSimulation();
                break;
            case 4:
                showVectors = !showVectors;
                invalidate();
                break;
            case 5:
                showTrail = !showTrail;
                if (!showTrail) trail.clear();
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
