package pt.esferavetorial.app;

public final class BallPhysics {
    public float x, y, vx, vy, ax, ay;
    public float displayAx, displayAy;
    public float distance;
    public boolean realSphere = true;
    public boolean frictionEnabled = true;
    public boolean collidedThisFrame;

    private static final float REAL_SPHERE_FACTOR = 5f / 7f;
    private static final float ROLLING_RESISTANCE = 0.028f;
    private static final float LINEAR_DRAG = 0.045f;
    private static final float RESTITUTION = 0.22f;
    private static final float TANGENTIAL_DAMPING = 0.72f;
    private static final float STOP_SPEED = 0.005f;

    public void reset(float widthM, float heightM) {
        x = widthM * 0.28f;
        y = heightM * 0.50f;
        vx = vy = ax = ay = displayAx = displayAy = 0f;
        distance = 0f;
        collidedThisFrame = false;
    }

    public float speed() {
        return (float) Math.hypot(vx, vy);
    }

    public float acceleration() {
        return (float) Math.hypot(displayAx, displayAy);
    }

    public void update(float dt, float gravityX, float gravityY,
                       float widthM, float heightM, float radiusM) {
        if (dt <= 0f) return;
        dt = Math.min(dt, 0.035f);
        collidedThisFrame = false;

        float factor = realSphere ? REAL_SPHERE_FACTOR : 1f;
        float baseAx = factor * gravityX;
        float baseAy = factor * gravityY;

        float frictionX = 0f;
        float frictionY = 0f;
        float dragX = 0f;
        float dragY = 0f;
        float speed = speed();

        if (frictionEnabled) {
            if (speed > 1e-4f) {
                frictionX = -ROLLING_RESISTANCE * vx / speed;
                frictionY = -ROLLING_RESISTANCE * vy / speed;
            }
            dragX = -LINEAR_DRAG * vx;
            dragY = -LINEAR_DRAG * vy;
        }

        ax = baseAx + frictionX + dragX;
        ay = baseAy + frictionY + dragY;
        displayAx = ax;
        displayAy = ay;

        float oldX = x;
        float oldY = y;

        vx += ax * dt;
        vy += ay * dt;

        if (frictionEnabled) {
            if (Math.abs(baseAx) < ROLLING_RESISTANCE && Math.abs(vx) < STOP_SPEED) vx = 0f;
            if (Math.abs(baseAy) < ROLLING_RESISTANCE && Math.abs(vy) < STOP_SPEED) vy = 0f;
        }

        x += vx * dt;
        y += vy * dt;

        float left = radiusM;
        float right = widthM - radiusM;
        float top = radiusM;
        float bottom = heightM - radiusM;

        if (x < left) {
            x = left;
            if (vx < 0f) {
                float beforeX = vx;
                float beforeY = vy;
                vx = -vx * RESTITUTION;
                vy *= TANGENTIAL_DAMPING;
                displayAx += (vx - beforeX) / dt;
                displayAy += (vy - beforeY) / dt;
                collidedThisFrame = true;
            }
        } else if (x > right) {
            x = right;
            if (vx > 0f) {
                float beforeX = vx;
                float beforeY = vy;
                vx = -vx * RESTITUTION;
                vy *= TANGENTIAL_DAMPING;
                displayAx += (vx - beforeX) / dt;
                displayAy += (vy - beforeY) / dt;
                collidedThisFrame = true;
            }
        }

        if (y < top) {
            y = top;
            if (vy < 0f) {
                float beforeX = vx;
                float beforeY = vy;
                vy = -vy * RESTITUTION;
                vx *= TANGENTIAL_DAMPING;
                displayAx += (vx - beforeX) / dt;
                displayAy += (vy - beforeY) / dt;
                collidedThisFrame = true;
            }
        } else if (y > bottom) {
            y = bottom;
            if (vy > 0f) {
                float beforeX = vx;
                float beforeY = vy;
                vy = -vy * RESTITUTION;
                vx *= TANGENTIAL_DAMPING;
                displayAx += (vx - beforeX) / dt;
                displayAy += (vy - beforeY) / dt;
                collidedThisFrame = true;
            }
        }

        distance += (float) Math.hypot(x - oldX, y - oldY);
    }
}
