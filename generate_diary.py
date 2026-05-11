#!/usr/bin/env python3
"""技能実習日誌 自動生成スクリプト

使い方:
    python generate_diary.py 技能実習日誌_入力補助.xlsx
    python generate_diary.py 技能実習日誌_入力補助.xlsx 42   # シード値指定
"""

import calendar
import math
import random
import sys

import openpyxl

SHEET_NAME = "★日誌自動生成"

MONTHLY_REQUIRED = {
    1:  {1: 91, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    2:  {1: 95, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    3:  {1: 95, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    4:  {1: 95, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    5:  {1: 94, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    6:  {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    7:  {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    8:  {1: 70, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    9:  {1: 70, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    10: {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    11: {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
    12: {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
}

NUM_TO_WORKS = {
    1: [
        ("掘削作業", ["マンホール布設", "汚水桝布設", "管布設", "水道掘削", "溝掘削", "法面掘削", "基礎掘削"]),
        ("土砂積込み作業", ["過積載防止", "周囲の確認", "積込み確認", "安全確認"]),
        ("走行操作作業", ["発進操作", "平坦地走行", "登坂操作", "降坂操作", "停止操作", "下車操作"]),
        ("毎日整備", ["目視点検", "グリース注入", "燃料補給", "清掃作業"]),
        ("始業前点検", ["目視点検", "備品確認", "始業確認", "安全点検"]),
    ],
    2: [
        ("作業開始前の安全装置等の点検作業", ["目視点検", "安全確認", "始業前確認", "安全装置確認"]),
        ("建設機械施工職種に必要な整理整頓作業", ["道具整理", "現場整理", "用具整頓", "工具整備"]),
        ("保護具の着用と服装の安全点検作業", ["保護具確認", "服装点検", "安全確認"]),
        ("雇入れ時等の安全衛生教育", ["安全教育", "衛生教育", "ルール確認"]),
    ],
    3: [
        ("掘削作業", ["手元作業", "補助作業", "埋戻し", "残土処理"]),
        ("締固め作業", ["埋戻し", "ランマ転圧", "転圧作業", "締固め確認"]),
        ("土工作業(対象職種・作業に係る手作業の作業）", ["手元作業", "蓋かさ上げ", "補助作業", "整地作業"]),
        ("積込み作業", ["手元作業", "補助積込み", "残土積込み"]),
        ("建設機械の管理及び点検・整備作業", ["バケット交換", "グリース注入", "清掃作業", "オイル点検"]),
    ],
    4: [
        ("安全衛生業務", ["荷物搬入", "現場清掃", "補助作業", "用具整備", "資材確認"]),
        ("建設機械施工職種に必要な整理整頓作業", ["道具整理", "現場整理", "工具整備"]),
    ],
    5: [
        ("建設機械の移送車両への積載及び移送作業", ["声出し誘導", "ユンボ回送", "機械移送", "積載補助", "誘導補助"]),
    ],
    6: [
        ("安全衛生業務", ["安全訓練", "倉庫整理", "現場内清掃", "安全管理", "安全確認"]),
    ],
}


def allocate_days(n_days: int, month: int) -> dict:
    """出勤日数と月から、番号→割当日数 の辞書を返す。

    余剰日はすべて番号1に加算。
    日数不足時は番号1→番号3の順に削って他番号を優先確保。
    """
    reqs = MONTHLY_REQUIRED[month]
    min_d = {k: math.ceil(v / 8) for k, v in reqs.items()}
    total_min = sum(min_d.values())

    if n_days >= total_min:
        alloc = dict(min_d)
        alloc[1] += n_days - total_min
    elif n_days > 0:
        alloc = dict(min_d)
        deficit = total_min - n_days
        take_from_1 = min(deficit, alloc[1] - 1)
        alloc[1] -= take_from_1
        deficit -= take_from_1
        if deficit > 0:
            take_from_3 = min(deficit, alloc[3] - 1)
            alloc[3] -= take_from_3
    else:
        alloc = {k: 0 for k in reqs}

    return alloc


def shuffle_no_triple(lst: list, rng: random.Random) -> list:
    """同じ番号が3連続しないようにシャッフルする（最大200回試行）。"""
    for _ in range(200):
        rng.shuffle(lst)
        if all(
            not (i >= 2 and lst[i] == lst[i - 1] == lst[i - 2])
            for i in range(len(lst))
        ):
            return lst
    return lst


def read_work_flags(ws, days_in_month: int) -> list:
    """行10・12から出勤フラグ（True/False）のリストを返す。

    B10:P10 → 1〜15日、B12:Q12 → 16〜31日
    セル値が 1 または "1" のとき出勤とみなす。
    """
    flags = []
    # 1〜15日: B(2)〜P(16) = 15セル
    for col in range(2, 17):
        val = ws.cell(row=10, column=col).value
        flags.append(val == 1 or val == "1")
    # 16〜31日: B(2)〜Q(17) = 16セル
    for col in range(2, 18):
        val = ws.cell(row=12, column=col).value
        flags.append(val == 1 or val == "1")
    return flags[:days_in_month]


def main():
    if len(sys.argv) < 2:
        print("使い方: python generate_diary.py <Excelファイルパス> [シード値]")
        sys.exit(1)

    excel_path = sys.argv[1]
    seed = int(sys.argv[2]) if len(sys.argv) >= 3 else None
    rng = random.Random(seed)

    wb = openpyxl.load_workbook(excel_path)

    if SHEET_NAME not in wb.sheetnames:
        print(f"エラー: シート「{SHEET_NAME}」が見つかりません。")
        sys.exit(1)

    ws = wb[SHEET_NAME]

    year = ws["B5"].value
    month = ws["E5"].value
    supervisor = ws["I5"].value or "中原"

    if not year or not month:
        print("エラー: B5（年）またはE5（月）が未入力です。")
        sys.exit(1)

    year = int(year)
    month = int(month)
    days_in_month = calendar.monthrange(year, month)[1]

    work_flags = read_work_flags(ws, days_in_month)
    working_days = [i + 1 for i, f in enumerate(work_flags) if f]
    n_working = len(working_days)

    print(f"対象: {year}年{month}月 / 指導員: {supervisor}")
    print(f"出勤日数: {n_working}日")
    print(f"出勤日: {working_days}")

    alloc = allocate_days(n_working, month)

    # 番号シーケンス生成
    num_seq = []
    for num, count in alloc.items():
        num_seq.extend([num] * count)

    num_seq = shuffle_no_triple(num_seq, rng)

    # 業務・指導内容のローテーションカウンタ
    work_idx = {k: 0 for k in NUM_TO_WORKS}

    # 書き込み先列
    D_COL = 4   # D列: 番号
    J_COL = 10  # J列: 業務名
    K_COL = 11  # K列: 指導内容
    H_COL = 8   # H列: 指導員名
    OUTPUT_START_ROW = 27

    for day in range(1, days_in_month + 1):
        row = OUTPUT_START_ROW + day - 1
        if day in working_days:
            seq_idx = working_days.index(day)
            num = num_seq[seq_idx]

            works = NUM_TO_WORKS[num]
            wi = work_idx[num] % len(works)
            wname, shidou_list = works[wi]
            shidou = shidou_list[work_idx[num] % len(shidou_list)]
            work_idx[num] += 1

            ws.cell(row=row, column=D_COL).value = num
            ws.cell(row=row, column=J_COL).value = wname
            ws.cell(row=row, column=K_COL).value = shidou
            ws.cell(row=row, column=H_COL).value = supervisor
        else:
            ws.cell(row=row, column=D_COL).value = None
            ws.cell(row=row, column=J_COL).value = "休み"
            ws.cell(row=row, column=K_COL).value = None
            ws.cell(row=row, column=H_COL).value = None

    wb.save(excel_path)
    print(f"\n書き込み完了: {excel_path}")

    # 集計サマリー
    reqs = MONTHLY_REQUIRED[month]
    print("\n【番号別 集計】")
    print(f"{'番号':>4}  {'必要時間':>8}  {'割当日数':>8}  {'実績時間':>8}  {'達成':>4}")
    print("-" * 46)
    total_req = 0
    total_actual = 0
    for num in range(1, 7):
        req_h = reqs[num]
        assigned = alloc.get(num, 0)
        actual_h = assigned * 8
        total_req += req_h
        total_actual += actual_h
        ok = "✓" if actual_h >= req_h else "△"
        print(f"{num:>4}  {req_h:>7}h  {assigned:>7}日  {actual_h:>7}h  {ok:>4}")
    print("-" * 46)
    all_ok = "✓" if all(alloc.get(n, 0) * 8 >= reqs[n] for n in range(1, 7)) else "△"
    print(f"{'合計':>4}  {total_req:>7}h  {n_working:>7}日  {total_actual:>7}h  {all_ok:>4}")


if __name__ == "__main__":
    main()
