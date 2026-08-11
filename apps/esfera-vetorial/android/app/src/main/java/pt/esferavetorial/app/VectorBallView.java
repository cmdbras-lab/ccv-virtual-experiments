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
    private final RectF inertiaSlider = new RectF();

    private static final float CONTROL_DEAD_ZONE = 0.10f;

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
    private boolean draggingInertia;
    private float inertiaSetting = 0.82f;

    private final float targetXFraction = 0.75f;
    private final float targetYFraction = 0.46f;
    private final float targetRadiusM = 0.018f;

    private final float density;

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
        float h = 42f * density;
        float y2 = getHeight() - systemBottomInsetPx - margin - h;
        return y2 - gap - h;
    }

    private float controlsTopPx() {
        return buttonRowsTopPx() - 64f * density;
    }

    private float playableHeightM() {
        if (pixelsPerMeter <= 0f) return heightM;
        float bottomPx = Math.max(px(radiusM * 2f), controlsTopPx() - 10f * density);
        return Math.min(heightM, bottomPx / pixelsPerMeter);
    }

    private void resetSimulation() {
        physics.reset(widthM, playableHeightM());
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

    private float controlGain() {
        return 0.24f + (0.045f - 0.24f) * inertiaSetting;
    }

    private float controlTauSeconds() {
        float shaped = (float) Math.pow(inertiaSetting, 1.35);
        return 0.08f + 0.66f * shaped;
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
        float requestedX = controlGain() * deadZone(rawGravityX);
        float requestedY = controlGain() * deadZone(rawGravityY);
        float smoothing = 1f - (float) Math.exp(-dt / controlTauSeconds());
        controlGravityX += smoothing * (requestedX - controlGravityX);
        controlGravityY += smoothing * (requestedY - controlGravityY);

        physics.update(dt, controlGravityX, controlGravityY,
                widthM, playableHeightM(), radiusM);

        long nowMs = SystemClock.elapsedRealtime();
        if (physics.collidedThisFrame) {
            shownAx = physics.displayAx;
            shownAy = physics.displayAy;
            impactVisibleUntilMs = nowMs + 150L;
        } else if (nowMs >= impactVisibleUntilMs) {
            shownAx = physics.ax;
            shownAy = physics.ay;
        }

        maxSpeed = Math.max(maxSpeed, physics.speed());
        updateChallenge();
        updateTrail();

        drawGrid(canvas);
        if (mode != 0) drawTarget(canvas);
        if (showTrail) drawTrail(canvas);
        drawBall(canvas);
        if (nowMs < impactVisibleUntilMs) drawImpactHalo(canvas);
        if (showVectors) drawVectors(canvas);
        drawHud(canvas, controlGravityX, controlGravityY);
        drawParameterPanel(canvas);
        drawButtons(canvas);
        if (success) drawSuccess(canvas);

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
        if (mode == 0 || success) return;
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
        paint.setStrokeWidth(1.7f * density);
        paint.setColor(Color.argb(125, 80, 90, 110));
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
        paint.setStrokeWidth(1.7f * density);
        paint.setColor(Color.rgb(25, 40, 85));
        canvas.drawCircle(cx, cy, r, paint);

        float rollAngle = radiusM > 0f ? physics.distance / radiusM : 0f;
        float dx = (float) Math.cos(rollAngle) * r * 0.78f;
        float dy = (float) Math.sin(rollAngle) * r * 0.78f;
        canvas.save();
        path.reset();
        path.addCircle(cx, cy, r * 0.94f, Path.Direction.CW);
        canvas.clipPath(path);
        paint.setStrokeWidth(2.2f * density);
        paint.setColor(Color.argb(180, 255, 255, 255));
        canvas.drawLine(cx - dx, cy - dy, cx + dx, cy + dy, paint);
        canvas.restore();
    }

    private void drawImpactHalo(Canvas canvas) {
        float cx = px(physics.x);
        float cy = px(physics.y);
        float r = px(radiusM) + 8f * density;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2.5f * density);
        paint.setColor(Color.argb(180, 235, 125, 25));
        canvas.drawCircle(cx, cy, r, paint);
    }

    private void drawVectors(Canvas canvas) {
        float cx = px(physics.x);
        float cy = px(physics.y);

        float velocityScale = 1050f * density;
        float accelerationScale = 220f * density;
        float maxLength = Math.min(getWidth() * 0.72f, 300f * density);

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
        if (length < 1.5f * density) return;
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
        paint.setStrokeWidth(5.5f * density);
        paint.setColor(color);
        canvas.drawLine(x1, y1, x2, y2, paint);

        float ux = dx / length;
        float uy = dy / length;
        float head = 16f * density;
        float wing = 9f * density;
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
        textPaint.setTextSize(20f * density);
        textPaint.setFakeBoldText(true);
        canvas.drawText(label, x2 + 8f * density, y2 - 7f * density, textPaint);
        textPaint.setFakeBoldText(false);
    }

    private void drawHud(Canvas canvas, float effectiveGravityX, float effectiveGravityY) {
        float pad = 12f * density;
        float boxTop = 10f * density;
        float boxHeight = 118f * density;
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
        String modeName = mode == 0 ? "Exploração" : (mode == 1 ? "Parar no alvo" : "Alvo: v máx. 0,40 m/s");
        canvas.drawText("Modo: " + modeName + "   •   Modelo: " + model,
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
        canvas.drawText(String.format(Locale.US, "%s • g∥ efetivo=(%.2f, %.2f) • percurso %.2f m",
                        sensor, effectiveGravityX, effectiveGravityY, physics.distance),
                pad + 12f * density, boxTop + 111f * density, textPaint);
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
        textPaint.setTextSize(12f * density);
        textPaint.setColor(Color.rgb(45, 52, 66));
        textPaint.setFakeBoldText(true);
        canvas.drawText(String.format(Locale.US, "Inércia aparente  %d%%", Math.round(inertiaSetting * 100f)),
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
        float sliderY = panel.bottom - 15f * density;
        inertiaSlider.set(sliderLeft, sliderY - 13f * density, sliderRight, sliderY + 13f * density);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(4f * density);
        paint.setColor(Color.rgb(180, 188, 199));
        canvas.drawLine(sliderLeft, sliderY, sliderRight, sliderY, paint);

        float knobX = sliderLeft + inertiaSetting * (sliderRight - sliderLeft);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(55, 77, 126));
        canvas.drawCircle(knobX, sliderY, 8f * density, paint);

        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawButtons(Canvas canvas) {
        String[] labels = {
                "Reiniciar", "Calibrar", physics.realSphere ? "Esfera real" : "Ideal",
                mode == 0 ? "Explorar" : (mode == 1 ? "Alvo" : "Alvo ≤0,40"),
                showVectors ? "Vetores ✓" : "Vetores", showTrail ? "Rasto ✓" : "Rasto"
        };
        float margin = 8f * density;
        float gap = 6f * density;
        float h = 42f * density;
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
            textPaint.setTextSize(12f * density);
            textPaint.setColor(Color.WHITE);
            textPaint.setFakeBoldText(i == 1);
            canvas.drawText(labels[i], buttons[i].centerX(), buttons[i].centerY() + 4f * density, textPaint);
            textPaint.setFakeBoldText(false);
        }
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawSuccess(Canvas canvas) {
        float cx = getWidth() * 0.5f;
        float cy = controlsTopPx() * 0.75f;
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(235, 24, 135, 72));
        RectF box = new RectF(cx - 125f * density, cy - 48f * density,
                cx + 125f * density, cy + 48f * density);
        canvas.drawRoundRect(box, 18f * density, 18f * density, paint);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setColor(Color.WHITE);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(22f * density);
        canvas.drawText("Objetivo atingido", cx, cy - 8f * density, textPaint);
        textPaint.setTextSize(16f * density);
        canvas.drawText("Pontuação: " + score, cx, cy + 20f * density, textPaint);
        textPaint.setFakeBoldText(false);
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private void setInertiaFromX(float x) {
        float left = inertiaSlider.left;
        float right = inertiaSlider.right;
        if (right <= left) return;
        inertiaSetting = Math.max(0f, Math.min(1f, (x - left) / (right - left)));
        invalidate();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX();
        float y = event.getY();

        if (event.getAction() == MotionEvent.ACTION_DOWN) {
            if (inertiaSlider.contains(x, y)) {
                draggingInertia = true;
                setInertiaFromX(x);
                return true;
            }
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_MOVE) {
            if (draggingInertia) {
                setInertiaFromX(x);
                return true;
            }
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_UP) {
            if (draggingInertia) {
                setInertiaFromX(x);
                draggingInertia = false;
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
            draggingInertia = false;
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
                mode = (mode + 1) % 3;
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
