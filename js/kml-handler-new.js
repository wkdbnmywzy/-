// kml-handler-new.js
// 重构版KML交点处理：只检测真实几何交点，完整保留所有形状点

// 处理线段的交点,分割相交的线段（重构版）
function processLineIntersections(features) {
    const lines = features.filter(f => f.geometry.type === 'line');
    const points = features.filter(f => f.geometry.type === 'point');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    if (lines.length < 2) {
        console.log('线段数量不足,无需处理交点');
        return features;
    }

    console.log(`开始处理${lines.length}条线段的交点（重构版）...`);

    // 为每条线建立分割点列表
    const lineSplitPoints = lines.map(line => ({
        line: line,
        coords: line.geometry.coordinates,
        splits: [] // {segmentIndex, point, t}
    }));

    // 检测所有真实的几何交点
    for (let i = 0; i < lines.length; i++) {
        const tree1 = lineSplitPoints[i];
        const coords1 = tree1.coords;

        for (let j = i + 1; j < lines.length; j++) {
            const tree2 = lineSplitPoints[j];
            const coords2 = tree2.coords;

            // 检查两条完整折线的所有小段对
            for (let seg1 = 0; seg1 < coords1.length - 1; seg1++) {
                const p1a = coords1[seg1];
                const p1b = coords1[seg1 + 1];

                for (let seg2 = 0; seg2 < coords2.length - 1; seg2++) {
                    const p2a = coords2[seg2];
                    const p2b = coords2[seg2 + 1];

                    const EPSILON = 1e-8;

                    // 1. 检查端点重合（已经是连接点，无需分割）
                    if (pointsEqual(p1a, p2a, EPSILON) || pointsEqual(p1a, p2b, EPSILON) ||
                        pointsEqual(p1b, p2a, EPSILON) || pointsEqual(p1b, p2b, EPSILON)) {
                        continue;
                    }

                    // 2. 检查T型交叉：某条线的端点在另一条线的中间
                    const p1aT = isPointOnSegmentStrictParam(p1a, p2a, p2b, EPSILON);
                    const p1bT = isPointOnSegmentStrictParam(p1b, p2a, p2b, EPSILON);
                    const p2aT = isPointOnSegmentStrictParam(p2a, p1a, p1b, EPSILON);
                    const p2bT = isPointOnSegmentStrictParam(p2b, p1a, p1b, EPSILON);

                    if (p1aT !== null) {
                        tree2.splits.push({segmentIndex: seg2, point: [p1a[0], p1a[1]], t: p1aT});
                    }
                    if (p1bT !== null) {
                        tree2.splits.push({segmentIndex: seg2, point: [p1b[0], p1b[1]], t: p1bT});
                    }
                    if (p2aT !== null) {
                        tree1.splits.push({segmentIndex: seg1, point: [p2a[0], p2a[1]], t: p2aT});
                    }
                    if (p2bT !== null) {
                        tree1.splits.push({segmentIndex: seg1, point: [p2b[0], p2b[1]], t: p2bT});
                    }

                    // 3. 检查十字交叉：两个小段在��间相交
                    if (p1aT === null && p1bT === null && p2aT === null && p2bT === null) {
                        const cross = getSegmentIntersection(
                            p1a[0], p1a[1], p1b[0], p1b[1],
                            p2a[0], p2a[1], p2b[0], p2b[1]
                        );

                        if (cross && cross.isInterior) {
                            const crossPoint = [cross.lng, cross.lat];
                            tree1.splits.push({segmentIndex: seg1, point: crossPoint, t: cross.t});
                            tree2.splits.push({segmentIndex: seg2, point: crossPoint, t: cross.u});
                        }
                    }
                }
            }
        }
    }

    // 统计交点
    const totalSplits = lineSplitPoints.reduce((sum, tree) => sum + tree.splits.length, 0);
    console.log(`检测到${totalSplits}个真实交点需要分割`);

    // 对每条线进行分割
    const newLines = [];
    let segmentCounter = 1;

    lineSplitPoints.forEach(tree => {
        const {line, coords, splits} = tree;

        if (splits.length === 0) {
            newLines.push(line);
            return;
        }

        // 排序并去重分割点
        splits.sort((a, b) => {
            if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex;
            return a.t - b.t;
        });

        const uniqueSplits = [];
        for (let i = 0; i < splits.length; i++) {
            if (i === 0 || !pointsEqual(splits[i].point, splits[i-1].point, 1e-8)) {
                uniqueSplits.push(splits[i]);
            }
        }

        // 执行分割
        const segments = splitLineByPoints2(coords, uniqueSplits);

        segments.forEach(segCoords => {
            if (segCoords.length >= 2) {
                newLines.push({
                    name: segments.length > 1 ? `${line.name}-段${segmentCounter++}` : line.name,
                    type: '线',
                    geometry: {
                        type: 'line',
                        coordinates: segCoords,
                        style: line.geometry.style
                    },
                    description: line.description + (segments.length > 1 ? ' (已分割)' : '')
                });
            }
        });
    });

    console.log(`线段处理完成: 原始${lines.length}条 -> 分割后${newLines.length}条`);
    return [...points, ...newLines, ...polygons];
}

// 判断两点是否相等
function pointsEqual(p1, p2, epsilon) {
    return Math.abs(p1[0] - p2[0]) < epsilon && Math.abs(p1[1] - p2[1]) < epsilon;
}

// 严格检查点是否在线段内部（返回参数t或null）
function isPointOnSegmentStrictParam(point, segStart, segEnd, epsilon) {
    const dx = segEnd[0] - segStart[0];
    const dy = segEnd[1] - segStart[1];
    const len2 = dx * dx + dy * dy;

    if (len2 < epsilon * epsilon) return null;

    const t = ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / len2;

    // 必须在(0, 1)内部
    if (t <= epsilon || t >= 1 - epsilon) return null;

    // 检查点是否真的在线段上
    const projX = segStart[0] + t * dx;
    const projY = segStart[1] + t * dy;
    const dist2 = (point[0] - projX) * (point[0] - projX) + (point[1] - projY) * (point[1] - projY);

    return dist2 < epsilon * epsilon ? t : null;
}

// 根据分割点列表切分坐标数组
function splitLineByPoints2(coords, splitPoints) {
    if (splitPoints.length === 0) return [coords];

    const segments = [];
    let current = [coords[0]];
    let coordIdx = 0;

    for (const split of splitPoints) {
        const {segmentIndex, point} = split;

        // 添加到分割点所在小段之前的所有坐标
        while (coordIdx < segmentIndex) {
            coordIdx++;
            current.push(coords[coordIdx]);
        }

        // 添加分割点
        if (!pointsEqual(point, current[current.length - 1], 1e-8)) {
            current.push(point);
        }

        if (current.length >= 2) {
            segments.push(current);
        }

        current = [point];
    }

    // 添加剩余坐标
    while (coordIdx < coords.length - 1) {
        coordIdx++;
        current.push(coords[coordIdx]);
    }

    if (current.length >= 2) {
        segments.push(current);
    }

    return segments;
}
